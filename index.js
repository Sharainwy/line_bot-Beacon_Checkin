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
      // wss.clients.forEach(client => {
      //   if (client.readyState === WebSocket.OPEN) {
      //     client.send(JSON.stringify(dataToSend));
      //   }
      // });
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


// // Handle beacon events
// async function handleBeacon(event, database) {
//     const beaconUserId = event.source.userId;
    
//     const checkinCollection = database.collection('checkins');
//     const existingCheckin = await checkinCollection.findOne({ userId: beaconUserId });

//     const userProfileCollection = database.collection('liff-user');
//     const userProfile = await userProfileCollection.findOne({ userId: event.source.userId });
    
//     const name = userProfile.displayName + " : " + userProfile.firstname;
//     const currentTime = new Date();
//     const bangkokTime = new Date(currentTime.getTime());

//     //const bangkokTime = new Date(currentTime.getTime() + 7 * 1000); // เพิ่มเวลา 7 ชั่วโมง
//     const currentCheckinDate = bangkokTime.toLocaleDateString('th-TH'); // Current date in 'YYYY-MM-DD' format
    
//     if (existingCheckin) {
//         const lastCheckinDate = existingCheckin.checkinTime.split(' ')[0];; // Last check-in date
//         // console.log(name);
//         // console.log(currentCheckinDate);
//         // console.log(existingCheckin.checkinTime);

//         // เปรียบเทียบวันที่
//            if (lastCheckinDate === currentCheckinDate) {
//             const lastCheckinTime = new Date(existingCheckin.checkinTime).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
//             console.log(name + 'ได้เช็คอินแล้วเมื่อเวลา : ' + existingCheckin.checkinTime);
//             return await replyText(event.replyToken, `คุณได้เช็คอินแล้วเมื่อเวลา ${existingCheckin.checkinTime}`); 
//         }
//          else {
//             await checkinCollection.updateOne(
//                 { userId: beaconUserId },
//                 { $set: { checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) } } // บันทึกเวลาในรูปแบบ ISO
//             );
//         }
//     } else {
//         await checkinCollection.insertOne({
//             userId: beaconUserId,
//             checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }), // บันทึกเวลาในรูปแบบ ISO
//         });
//     }
    
//     // Send data to WebSocket
//     const dataToSend = {
//         userId: beaconUserId,
//         checkinTime: bangkokTime.toISOString(),
//         message: 'เช็คอินสำเร็จสำหรับวันนี้',
//     };
//     wss.clients.forEach(client => {
//         if (client.readyState === WebSocket.OPEN) {
//             client.send(JSON.stringify(dataToSend));
//         }
//     });
//     console.log(name + `เช็คอินสำเร็จสำหรับวันนี้ เวลา: `+ bangkokTime.toISOString('th-TH', { timeZone: 'Asia/Bangkok' }));
//     return await replyText(event.replyToken, `เช็คอินสำเร็จสำหรับวันนี้ เวลา: ${bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
    
// }


// Handle beacon events
async function handleBeacon(event, database) {
  const beaconUserId = event.source.userId;
  const checkinCollection = database.collection('checkins');
  const existingCheckin = await checkinCollection.findOne({ userId: beaconUserId });
  const userProfileCollection = database.collection('liff-user');
  const userProfile = await userProfileCollection.findOne({ userId: beaconUserId });

  const name = userProfile.displayName + " : " + userProfile.firstname;
  // const currentTime = new Date();
  // const bangkokTime = new Date(currentTime.getTime());
  // const currentCheckinDate = bangkokTime.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
  // const currentHour = bangkokTime.getHours();
  // Localhost Time

  const currentTime = new Date();
  const GMTTime = new Date(currentTime.getTime()); 
  const bangkokTime = new Date(currentTime.getTime() + (7 * 60 * 60 * 1000));  // Current time in Bangkok
  const currentCheckinDate = bangkokTime.toLocaleDateString('th-TH', { timeZone: 'Africa/Accra' });
  

  const currentHour = bangkokTime.getHours() - 7 ;
 // Deploy on Render.com Time 
  

  // ฟิลด์สำหรับตรวจสอบการเช็คอินในแต่ละช่วง
  let checkinCountMorning = 0;
  let checkinCountAfternoon = 0;

  // กำหนดช่วงเวลาเช็คอิน
  const morningStartHour = 6;
  const morningEndHour = 9;
  const afternoonStartHour = 17;
  const afternoonEndHour = 20;

  let period = "";  // สำหรับเก็บข้อมูลช่วงเวลา (เช้า/บ่าย)

  if (existingCheckin) {
      // แยกการเช็คอินเช้าและเย็นในเอกสารที่มีอยู่
      const lastCheckinDate = existingCheckin.checkinTime.split(' ')[0];
      const morningCheckin = existingCheckin.morningCheckin || false;
      const afternoonCheckin = existingCheckin.afternoonCheckin || false;
      
      // เช็คอินเช้า
      if (lastCheckinDate === currentCheckinDate && currentHour >= morningStartHour && currentHour < morningEndHour) {
          if (morningCheckin) {
              return await replyText(event.replyToken, `คุณได้เช็คอินช่วงเช้าแล้วเวลา ${existingCheckin.morningCheckinTime}`);
          } else {
              checkinCountMorning = (existingCheckin.morningCheckinCount || 0) + 1;
              await checkinCollection.updateOne(
                  { userId: beaconUserId },
                  {
                      $set: {
                          morningCheckin: true,
                          morningCheckinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' }),
                          morningCheckinCount: checkinCountMorning,
                      }
                  }
              );
              period = "เช้า";
          }
      }
      // เช็คอินบ่าย
      else if (lastCheckinDate === currentCheckinDate && currentHour >= afternoonStartHour && currentHour < afternoonEndHour) {
          if (afternoonCheckin) {
              return await replyText(event.replyToken, `คุณได้เช็คอินช่วงบ่ายแล้วเวลา ${existingCheckin.afternoonCheckinTime}`);
          } else {
              checkinCountAfternoon = (existingCheckin.afternoonCheckinCount || 0) + 1;
              await checkinCollection.updateOne(
                  { userId: beaconUserId },
                  {
                      $set: {
                          afternoonCheckin: true,
                          afternoonCheckinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' }),
                          afternoonCheckinCount: checkinCountAfternoon,
                      }
                  }
              );
              period = "บ่าย";
          }
      } else {
          console.log( 'currentCheckinDate : '+ bangkokTime);
          console.log( 'currentCheckinDate : '+ currentHour);

          return await replyText(event.replyToken, `ไม่สามารถเช็คอินได้ เนื่องจากไม่อยู่ในช่วงเวลาเช็คอินที่กำหนด`);
          
      }
  } else {
      // เช็คอินครั้งแรกของวัน
      if (currentHour >= morningStartHour && currentHour < morningEndHour) {
          checkinCountMorning = 1;
          await checkinCollection.insertOne({
              userId: beaconUserId,
              checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' }),
              morningCheckin: true,
              morningCheckinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' }),
              morningCheckinCount: checkinCountMorning
          });
          period = "เช้า";
      } else if (currentHour >= afternoonStartHour && currentHour < afternoonEndHour) {
          checkinCountAfternoon = 1;
          await checkinCollection.insertOne({
              userId: beaconUserId,
              checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' }),
              afternoonCheckin: true,
              afternoonCheckinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' }),
              afternoonCheckinCount: checkinCountAfternoon
          });
          period = "บ่าย";
      } else {
          console.log( 'currentCheckinDate : '+ currentCheckinDate);
          console.log( 'currentCheckinDate : '+ bangkokTime);
          return await replyText(event.replyToken, `ไม่สามารถเช็คอินได้ในขณะนี้ เนื่องจากไม่อยู่ในช่วงเวลาเช็คอินที่กำหนด`);
      }
  }

  // ข้อมูลที่ส่งไปยัง WebSocket clients
  const dataToSend = {
      type: 'beacon',
      userId: userProfile.userId,
      displayName: userProfile.firstname,
      Linename: userProfile.displayName,
      pictureUrl: userProfile.picture,
      statusMessage: userProfile.position,
      occupplace: userProfile.location,
      checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' })
  };

  // ส่งข้อมูลไปยัง WebSocket clients
  wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(dataToSend));
      }
  });

  // ตอบกลับผู้ใช้ว่าเช็คอินสำเร็จ
  return await replyText(event.replyToken, `เช็คอินสำเร็จสำหรับช่วง${period} เวลา: ${bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' })}`);
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

