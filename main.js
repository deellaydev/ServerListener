const {info, players, rules, destroy} = require('source-server-query')
const mariadb = require('mariadb')
const {WebhookClient, MessageEmbed} = require('discord.js')

const pool = mariadb.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
})

let warningNotify = true
let warningCounter = 0
let errorFlag = false

const webhookClient = new WebhookClient({
  id: process.env.WEBHOOK_URL.split('/')[5],
  token: process.env.WEBHOOK_URL.split('/')[6]
})

let conn;
let playersNum = []
let mapChecker = []
let uptimes = ['-', '-']

async function main() {

  try {
    let serverId = await conn.query(`SELECT id FROM servers WHERE ip='${process.env.SERVER_IP}' AND port='${process.env.SERVER_PORT}'`).then(res => res[0].id)
  } catch (e) {
    if (!errorFlag) {
      const embed = new MessageEmbed()
        .setAuthor({
          name: process.env.WEBHOOK_NAME,
          iconURL: process.env.WEBHOOK_IMG_URL
        })
        .setTitle(` :exclamation:  Не найден сервер в базе данных программы ${e.message}`)
        .setColor('#ff0000')

      await webhookClient.send({
        content: `<@398890993371316225>`,
        embeds: [embed]
      })
      errorFlag = true
    }
  }
  try {
    let serverId = await conn.query(`SELECT id FROM servers WHERE ip='${process.env.SERVER_IP}' AND port='${process.env.SERVER_PORT}'`).then(res => res[0].id)
    errorFlag = false
    const data = await info(`${process.env.SERVER_IP}`, process.env.SERVER_PORT, 10000)
    conn.query(`INSERT INTO online(sid, date, players) VALUES ('${serverId}',NOW(),'${data.players}')`)
    let csgotv = await players(`${process.env.SERVER_IP}`, process.env.SERVER_PORT, 5000).then(data => data.filter(item => item.name === 'VK.COM/LEGSS'))
    let uptime = `${Math.floor(parseInt(csgotv[0].duration) / 3600)} ч. ${Math.floor(parseInt(csgotv[0].duration) / 60) - ((Math.floor(parseInt(csgotv[0].duration) / 3600)) * 60)} м.`

    let playersCheckData = await playersCountCheck(data.players, data.map, uptime)

    if (playersCheckData.warning) {
      const embed = new MessageEmbed()
        .setAuthor({
          name: process.env.WEBHOOK_NAME,
          iconURL: process.env.WEBHOOK_IMG_URL
        })
        .setTitle(` :exclamation:  Резкое падение онлайна на сервере ${process.env.SERVER_NAME}`)
        .setFields(
          {name: 'Было', value: `${playersCheckData.prevPlayers}\n${playersCheckData.prevMap}`, inline: true},
          {name: 'Стало', value: `${playersCheckData.currentPlayers}\n${playersCheckData.currentMap}`, inline: true}
        )
        .setFooter(
          {text: `🔘 Uptime - ${playersCheckData.currentUptime} \n🔘 Previous uptime - ${playersCheckData.prevUptime}`}
        )
        .setColor(process.env.WEBHOOK_COLOR)

      await webhookClient.send({
        content: `<@${process.env.DISCORD_USER_ID}>`,
        embeds: [embed]
      })
    }

    warningCounter = 0;

    await conn.end()
  } catch (e) {
    warningNotifyCheck()
    if (warningCounter === 1) {
      setTimeout(async () => {
        try {
          const embed = new MessageEmbed()
            .setAuthor({
              name: process.env.WEBHOOK_NAME,
              iconURL: process.env.WEBHOOK_IMG_URL
            })
            .setTitle(`Сервер ${process.env.SERVER_NAME}`)
            .setFooter(
              {text: `🔘 Uptime - ${uptimes[1]} \n🔘 Previous uptime - ${uptimes[0]}`}
            )
            .setColor(process.env.WEBHOOK_COLOR)

          await webhookClient.send({
            embeds: [embed]
          })
        } catch (e) {
        }
      }, 10000)
    }
    return;
  }

  try {
    if (!warningNotify) {
      warningNotify = true
      warningCounter = 0

      const embed = new MessageEmbed()
        .setAuthor({
          name: process.env.WEBHOOK_NAME,
          iconURL: process.env.WEBHOOK_IMG_URL
        })
        .setTitle(` :green_circle: Оповещение сервера ${process.env.SERVER_NAME} включено`)
        .setColor(process.env.WEBHOOK_COLOR)

      await webhookClient.send({
        embeds: [embed]
      })
    }
  } catch (e) {
    console.error(`Something is wrong with webhook sending ${e}`);
  }
}

function playersCountCheck(players, map, uptime) {

  playersNum.push(players)
  mapChecker.push(map)
  uptimes.push(uptime)
  if (playersNum.length > 2) {
    playersNum.shift()
    mapChecker.shift()
    uptimes.shift()
  }
  if (playersNum.length === 2) {
    return {
      warning: playersNum[0] - playersNum[1] >= process.env.PLAYERS_DIFFERENCE,
      prevPlayers: playersNum[0],
      currentPlayers: playersNum[1],
      prevMap: mapChecker[0],
      currentMap: mapChecker[1],
      prevUptime: uptimes[0],
      currentUptime: uptimes[1],
    };
  }
  return false

}

function warningNotifyCheck() {

  if (warningNotify && warningCounter !== +process.env.MAX_WARNING_COUNTER) {

    const embed = new MessageEmbed()
      .setAuthor({
        name: process.env.WEBHOOK_NAME,
        iconURL: process.env.WEBHOOK_IMG_URL
      })
      .setTitle(`Сервер ${process.env.SERVER_NAME} не отвечает`)
      .setColor(process.env.WEBHOOK_COLOR)
      .setFooter(
        {text: `Предупреждение - ${++warningCounter}/${process.env.MAX_WARNING_COUNTER}\n🔘 Uptime - ${uptimes[1]} \n🔘 Previous uptime - ${uptimes[0]}`}
      )

    webhookClient.send({
      content: `<@${process.env.DISCORD_USER_ID}>`,
      embeds: [embed]
    })

    if (warningCounter === +process.env.MAX_WARNING_COUNTER) {
      warningNotify = false

      const embed = new MessageEmbed()
        .setAuthor({
          name: process.env.WEBHOOK_NAME,
          iconURL: process.env.WEBHOOK_IMG_URL
        })
        .setTitle(` :red_circle: Оповещение сервера ${process.env.SERVER_NAME} отключено`)
        .setColor(process.env.WEBHOOK_COLOR)

      webhookClient.send({
        embeds: [embed]
      })
    }
  }
}

async function setupConnection() {
  conn = await pool.getConnection();
  await conn.query("CREATE TABLE IF NOT EXISTS servers(id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, servername NVARCHAR(50) NOT NULL, ip NVARCHAR(50) NOT NULL, port NVARCHAR(50) NOT NULL, CONSTRAINT ip_port_unique UNIQUE(ip, port))")
  await conn.query("CREATE TABLE IF NOT EXISTS online(id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, sid INT NOT NULL, date DATETIME NOT NULL, players INT NOT NULL, FOREIGN KEY (sid) REFERENCES servers (id))")
  try {
    await conn.query(`INSERT IGNORE INTO servers (servername, ip, port) VALUES ('${process.env.SERVER_NAME}', '${process.env.SERVER_IP}', '${process.env.SERVER_PORT}');`);
  } catch (e) {
  }
}

setupConnection().then(() => {
  setInterval(() => {
    main();
  }, process.env.INTERVAL_REQUEST * 1000);
}).catch(e => {
  console.error('unexpected exception', e);
})

console.log(`${process.env.SERVER_NAME} service is active`)