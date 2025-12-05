const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActivityType } = require('discord.js');
const http = require('http');
const express = require('express');
const config = require('./config.json');

const app = express();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let lastMessageId = null;
let currentMessage = null;

app.get('/connect', (req, res) => {
  const redmUrl = `redm://connect/${config.ip}:${config.port}`;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="refresh" content="0;url=${redmUrl}">
      <title>กำลังเชื่อมต่อ...</title>
      <script>
        window.location.href = "${redmUrl}";
      </script>
    </head>
    <body>
      <p>กำลังเปิดการเชื่อมต่อ RedM...</p>
      <p>หากไม่เปิดอัตโนมัติ <a href="${redmUrl}">คลิกที่นี่</a></p>
    </body>
    </html>
  `);
});

app.listen(config.webServerPort, config.webServerHost, () => {
  console.log(`Web server ทำงานที่ http://${config.webServerHost}:${config.webServerPort}`);
});

async function fetchServerInfo() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: config.ip,
      port: config.port,
      path: '/info.json',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function fetchServerPlayers() {
  return new Promise((resolve) => {
    const options = {
      hostname: config.ip,
      port: config.port,
      path: '/players.json',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve([]);
        }
      });
    });
    
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

async function getPlayerCount() {
  try {
    const players = await fetchServerPlayers();
    return Array.isArray(players) ? players.length : 0;
  } catch (error) {
    return 0;
  }
}

async function getMaxPlayers() {
  try {
    const info = await fetchServerInfo();
    return info.vars?.sv_maxClients || info.maxClients || 32;
  } catch (error) {
    return 32;
  }
}

async function updateEmbed() {
  if (!currentMessage) return;

  const playerCount = await getPlayerCount();
  const maxPlayers = await getMaxPlayers();

  const connectUrl = `http://${config.webServerHost}:${config.webServerPort}/connect`;
  
  const button = new ButtonBuilder()
    .setLabel(config.buttonLabel)
    .setStyle(ButtonStyle.Link)
    .setURL(connectUrl);

  const row = new ActionRowBuilder()
    .addComponents(button);

  const colorHex = config.embedColor.replace('#', '');
  const colorDecimal = parseInt(colorHex, 16);

  const embed = new EmbedBuilder()
    .setTitle(config.embedTitle)
    .setDescription(config.embedDescription)
    .addFields(
      { name: config.playerCountLabel, value: `${playerCount}/${maxPlayers}`, inline: true }
    )
    .setColor(colorDecimal);

  if (config.embedImage && config.embedImage.trim() !== '') {
    embed.setImage(config.embedImage);
  }

  if (config.embedThumbnail && config.embedThumbnail.trim() !== '') {
    embed.setThumbnail(config.embedThumbnail);
  }

  if (config.embedFooterText && config.embedFooterText.trim() !== '') {
    const footerOptions = { text: config.embedFooterText };
    if (config.embedFooterIcon && config.embedFooterIcon.trim() !== '') {
      footerOptions.iconURL = config.embedFooterIcon;
    }
    embed.setFooter(footerOptions);
  }

  if (config.embedAuthorName && config.embedAuthorName.trim() !== '') {
    const authorOptions = { name: config.embedAuthorName };
    if (config.embedAuthorIcon && config.embedAuthorIcon.trim() !== '') {
      authorOptions.iconURL = config.embedAuthorIcon;
    }
    embed.setAuthor(authorOptions);
  }

  if (config.showTimestamp) {
    embed.setTimestamp();
  }

  try {
    await currentMessage.edit({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการอัปเดตข้อความ:', error);
  }
}

client.once('ready', async () => {
  console.log(`บอทพร้อมใช้งาน: ${client.user.tag}`);
  
  const activityTypes = {
    'PLAYING': ActivityType.Playing,
    'STREAMING': ActivityType.Streaming,
    'LISTENING': ActivityType.Listening,
    'WATCHING': ActivityType.Watching,
    'COMPETING': ActivityType.Competing
  };

  const activityType = activityTypes[config.botActivityType] || ActivityType.Watching;
  
  client.user.setPresence({
    activities: [{
      name: config.botActivityText,
      type: activityType
    }],
    status: config.botStatus
  });

  const channel = client.channels.cache.get(config.channelId);
  if (!channel) {
    console.error('ไม่พบช่องที่กำหนดไว้');
    return;
  }

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const botMessages = messages.filter(msg => msg.author.id === client.user.id);
    
    if (botMessages.size > 0) {
      await channel.bulkDelete(botMessages);
      console.log('ลบข้อความเดิมแล้ว');
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการลบข้อความ:', error);
  }

  const playerCount = await getPlayerCount();
  const maxPlayers = await getMaxPlayers();

  const connectUrl = `http://${config.webServerHost}:${config.webServerPort}/connect`;
  
  const button = new ButtonBuilder()
    .setLabel(config.buttonLabel)
    .setStyle(ButtonStyle.Link)
    .setURL(connectUrl);

  const row = new ActionRowBuilder()
    .addComponents(button);

  const colorHex = config.embedColor.replace('#', '');
  const colorDecimal = parseInt(colorHex, 16);

  const embed = new EmbedBuilder()
    .setTitle(config.embedTitle)
    .setDescription(config.embedDescription)
    .addFields(
      { name: config.playerCountLabel, value: `${playerCount}/${maxPlayers}`, inline: true }
    )
    .setColor(colorDecimal);

  if (config.embedImage && config.embedImage.trim() !== '') {
    embed.setImage(config.embedImage);
  }

  if (config.embedThumbnail && config.embedThumbnail.trim() !== '') {
    embed.setThumbnail(config.embedThumbnail);
  }

  if (config.embedFooterText && config.embedFooterText.trim() !== '') {
    const footerOptions = { text: config.embedFooterText };
    if (config.embedFooterIcon && config.embedFooterIcon.trim() !== '') {
      footerOptions.iconURL = config.embedFooterIcon;
    }
    embed.setFooter(footerOptions);
  }

  if (config.embedAuthorName && config.embedAuthorName.trim() !== '') {
    const authorOptions = { name: config.embedAuthorName };
    if (config.embedAuthorIcon && config.embedAuthorIcon.trim() !== '') {
      authorOptions.iconURL = config.embedAuthorIcon;
    }
    embed.setAuthor(authorOptions);
  }

  if (config.showTimestamp) {
    embed.setTimestamp();
  }

  try {
    const message = await channel.send({
      embeds: [embed],
      components: [row]
    });
    lastMessageId = message.id;
    currentMessage = message;
    console.log('สร้างปุ่มเรียบร้อยแล้ว');
    
    setInterval(updateEmbed, config.updateInterval);
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการส่งข้อความ:', error);
  }
});


client.login(config.token);

