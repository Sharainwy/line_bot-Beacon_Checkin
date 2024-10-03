'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const config = require('./config.json');
const http = require('http'); 
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');

const client = new line.Client(config);
const app = express();
const server = http.createServer(app); 
const wss = new WebSocket.Server({ server });

const mongoURL = 'mongodb+srv://Sharainwy:Mindbnk48@shar.xu2urv6.mongodb.net/'; 

async function getProfile(userId) {
  try {
    return await client.getProfile(userId);
  } catch (error) {
    console.error('Error getting profile:', error);
    return null;
  }
}

// Webhook callback
app.post('/webhook', line.middleware(config), async (req, res) => {
  if (!Array.isArray(req.body.events)) {
    return res.status(500).end();
  }

  try {
    await Promise.all(req.body.events.map(event => handleEvent(event)));
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

app.get('/', (req, res) => {
  res.status(200).send('OK Connect');
});

// Simple reply function
const replyText = (token, texts) => {
  texts = Array.isArray(texts) ? texts : [texts];
  return client.replyMessage(
    token,
    texts.map(text => ({ type: 'text', text }))
  );
};

// Handle events
async function handleEvent(event) {
  const clientdb = new MongoClient(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });
  await clientdb.connect();

  try {
    const database = clientdb.db('mydb');
    const userProfileCollection = database.collection('liff-user');
    const userProfile = await userProfileCollection.findOne({ userId: event.source.userId });

    if (userProfile) {
      const dataToSend = {
        type: 'beacon',
        userId: userProfile.userId,
        displayName: userProfile.firstname,
        Linename: userProfile.displayName,
        pictureUrl: userProfile.picture,
        statusMessage: userProfile.position,
        occupplace: userProfile.location,
      };
      // Send data to all connected WebSocket clients
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(dataToSend));
        }
      });
    }

    switch (event.type) {
      case 'message':
        await handleMessage(event, database);
        break;
      case 'follow':
        await replyText(event.replyToken, 'Got followed event');
        break;
      case 'unfollow':
        console.log(`Unfollowed this bot: ${JSON.stringify(event)}`);
        break;
      case 'join':
        await replyText(event.replyToken, `Joined ${event.source.type}`);
        break;
      case 'leave':
        console.log(`Left: ${JSON.stringify(event)}`);
        break;
      case 'postback':
        await replyText(event.replyToken, `Got postback: ${event.postback.data}`);
        break;
      case 'beacon':
        await handleBeacon(event, database);
        break;
      default:
        throw new Error(`Unknown event: ${JSON.stringify(event)}`);
    }
  } catch (error) {
    console.error('Error handling event:', error);
  } finally {
    await clientdb.close();
  }
}

// Handle message events
async function handleMessage(event, database) {
  const message = event.message;
  const UserID = event.source.userId;

  switch (message.type) {
    case 'text':
      await handleText(message, event.replyToken);
      break;
    case 'image':
      await handleImage(message, event.replyToken);
      break;
    case 'video':
      await handleVideo(message, event.replyToken);
      break;
    case 'audio':
      await handleAudio(message, event.replyToken);
      break;
    case 'location':
      await handleLocation(message, event.replyToken);
      break;
    case 'sticker':
      await handleSticker(message, event.replyToken);
      break;
    default:
      throw new Error(`Unknown message type: ${JSON.stringify(message)}`);
  }
}

// Handle beacon events
async function handleBeacon(event, database) {
  const beaconUserId = event.source.userId;
  const checkinCollection = database.collection('checkins');
  const existingCheckin = await checkinCollection.findOne({ userId: beaconUserId });

  const currentTime = new Date();
  const currentDate = currentTime.toISOString().split('T')[0]; // Current date in 'YYYY-MM-DD' format
  const bangkokTime = new Date(currentTime.getTime() + 7 * 60 * 60 * 1000);
  const formattedTime = bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  
  if (existingCheckin) {
    const lastCheckinDate = new Date(existingCheckin.checkinTime).toISOString().split('T')[0];

    if (lastCheckinDate === currentDate) {
      return await replyText(event.replyToken, 'คุณได้เช็คอินไปแล้ววันนี้');
    } else {
      await checkinCollection.updateOne(
        { userId: beaconUserId },
        { $set: { checkinTime: formattedTime } }
      );
    }
  } else {
    await checkinCollection.insertOne({
      userId: beaconUserId,
      checkinTime: formattedTime,
    });
  }
  
  // Send data to WebSocket
  const dataToSend = {
    userId: beaconUserId,
    checkinTime: formattedTime,
    message: 'เช็คอินสำเร็จสำหรับวันนี้',
  };
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(dataToSend));
    }
  });

  return await replyText(event.replyToken, `เช็คอินสำเร็จสำหรับวันนี้ เวลา: ${currentTime}`);
}

// Reply to different message types
async function handleText(message, replyToken) {
  return replyText(replyToken, message.text);
}

async function handleImage(message, replyToken) {
  return replyText(replyToken, 'Got Image');
}

async function handleVideo(message, replyToken) {
  return replyText(replyToken, 'Got Video');
}

async function handleAudio(message, replyToken) {
  return replyText(replyToken, 'Got Audio');
}

async function handleLocation(message, replyToken) {
  return replyText(replyToken, 'Got Location');
}

async function handleSticker(message, replyToken) {
  return replyText(replyToken, 'Got Sticker');
}

wss.on('connection', (ws) => {
  console.log('WebSocket connected');
});

wss.on('close', () => {
    console.log('WebSocket disconnected');
    // เพิ่มการจัดการเมื่อมีการตัดการเชื่อมต่อ WebSocket ที่นี่
  });

const port = config.port;

server.listen(port, () => {
  console.log(`Listening on ${port}`);
});
