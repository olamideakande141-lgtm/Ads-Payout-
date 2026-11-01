import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN;
const MY_CHANNEL = process.env.CHANNEL || '@freeearningofusdt';
const BOT_USERNAME = process.env.BOT_USERNAME || 'Realads01_bot';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://ads-payout-1.onrender.com';
const ADMIN_ID = process.env.ADMIN_ID || '8323896060';
const ADMIN_IDS = ADMIN_ID.split(',').map(x=>String(x).trim());
const MONGODB_URI = process.env.MONGODB_URI;

// ===== MONGODB CONNECT - NEVER RESET AGAIN =====
if(MONGODB_URI){
  mongoose.connect(MONGODB_URI).then(()=>console.log('✅ MongoDB Connected - Earnings PERMANENT!')).catch(e=>console.log('Mongo Error', e.message));
} else {
  console.log('❌ Add MONGODB_URI in Render Environment!');
}

const UserSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  balance: { type: Number, default: 0.05 },
  ad1Count: { type: Number, default: 0 }, ad1Date: String,
  ad2Count: { type: Number, default: 0 }, ad2Date: String,
  ad3Count: { type: Number, default: 0 }, ad3Date: String,
  checkinCount: { type: Number, default: 0 }, checkinDate: String, lastCheckinDate: String, streak: { type: Number, default: 0 },
  referrals: { type: Array, default: [] },
  referralEarnings: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  referredBy: String,
  completedDays: { type: Array, default: [] },
  username: String, firstName: String,
  referralLink: String
}, { strict: false });

const WithdrawSchema = new mongoose.Schema({
  id: Number, userId: String, amount: Number, fee: Number, receive: Number,
  wallet: String, network: String, status: { type: String, default: 'Pending' }, date: String
}, { strict: false });

const User = mongoose.model('User', UserSchema);
const Withdraw = mongoose.model('Withdraw', WithdrawSchema);

// ===== BOT LOGIC WITH MONGODB =====
let bot;
if(BOT_TOKEN){
  bot = new Telegraf(BOT_TOKEN);
  bot.telegram.deleteWebhook({drop_pending_updates: true}).catch(()=>{});
  const isAdmin = (id) => ADMIN_IDS.includes(String(id));

  bot.start(async (ctx)=>{
    const refId = ctx.startPayload;
    const tgUser = ctx.from;
    const uid = String(tgUser.id);
    const tgUsername = tgUser.username ? '@'+tgUser.username : '';
    const tgFirstName = tgUser.first_name || '';
    
    let me = await User.findOne({ telegramId: uid });
    if(!me){
      me = await User.create({
        telegramId: uid, balance:0.05, username: tgUsername, firstName: tgFirstName,
        ad1Count:0, ad1Date:'', ad2Count:0, ad2Date:'', ad3Count:0, ad3Date:'',
        checkinCount:0, checkinDate:'', streak:0, referrals:[], referredBy: refId||'',
        completedDays:[], referralLink:`https://t.me/${BOT_USERNAME}?start=${uid}`
      });
    }
    if(refId && refId!==uid){
      let refUser = await User.findOne({ telegramId: refId });
      if(!refUser){
        refUser = await User.create({ telegramId: refId, balance:0.05, referrals:[], referralLink:`https://t.me/${BOT_USERNAME}?start=${refId}` });
      }
      if(!refUser.referrals.find(r=>r.id===uid)){
        refUser.referrals.push({ id:uid, username:tgUsername, firstName:tgFirstName, day1Complete:false, day1Date:'', day2Complete:false, day2Date:'', valid:false, date:new Date().toISOString() });
        await refUser.save();
      }
    }
    const txt=`💎 ADS PAYOUT - INSTANT PAYOUTS\n\nWithdrawals arrive in MINUTES.\nMin $5 (20% fee)\n\nYour link: https://t.me/${BOT_USERNAME}?start=${uid}`;
    ctx.reply(txt, Markup.inlineKeyboard([[Markup.button.webApp('🚀 Launch Ads Payout', MINI_APP_URL)], [Markup.button.url('📢 Join Channel', `https://t.me/${MY_CHANNEL.replace('@','')}`)]]));
  });

  bot.command('admin', (ctx)=>{ if(!isAdmin(ctx.from.id)) return ctx.reply('❌ Not admin'); ctx.reply(`👑 ADMIN PANEL`, Markup.inlineKeyboard([[Markup.button.callback('👥 Users Stats', 'adm_users'), Markup.button.callback('💸 Withdraws', 'adm_with')]])); });
  bot.action('adm_users', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const count = await User.countDocuments(); const total = await User.aggregate([{$group:{_id:null, sum:{$sum:"$balance"}}}]); ctx.reply(`👥 ${count} users\n💰 Total $${(total[0]?.sum||0).toFixed(2)}`); });
  bot.action('adm_with', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const pending = await Withdraw.find({status:'Pending'}).limit(8); if(!pending.length) return ctx.reply('No pending'); pending.forEach(r=>{ ctx.reply(`💸 #${r.id}\n$${r.amount}-> $${r.receive}\n${r.wallet}\n${r.network}`, Markup.inlineKeyboard([[Markup.button.callback('✅ Approve', `app_${r.id}`), Markup.button.callback('❌ Reject', `rej_${r.id}`)]])); }); });
  bot.action(/app_(.*)/, async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const id=ctx.match[1]; let w=await Withdraw.findOne({id}); if(w){ w.status='Approved'; await w.save(); ctx.editMessageText(`✅ APPROVED #${id}`); try{await bot.telegram.sendMessage(w.userId, `✅ Withdraw $${w.amount} Approved!`)}catch{} } });
  bot.action(/rej_(.*)/, async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const id=ctx.match[1]; let w=await Withdraw.findOne({id}); if(w){ w.status='Rejected'; await w.save(); let u=await User.findOne({telegramId:w.userId}); if(u){ u.balance+=w.amount; await u.save(); } ctx.editMessageText(`❌ REJECTED #${id} Refunded`); } });
  bot.launch().then(()=>console.log('Bot @'+BOT_USERNAME)).catch(e=>console.log(e));
}

function getToday(){ return new Date().toDateString(); }
function checkAllAdsComplete(u){ return (u.ad1Count>=20 && u.ad2Count>=15 && u.ad3Count>=5); }
async function isUserInChannel(userId){
  if(!BOT_TOKEN) return true;
  try{ const chatId = MY_CHANNEL.startsWith('@') ? MY_CHANNEL : '@'+MY_CHANNEL; const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${userId}`); const data=await resp.json(); if(!data.ok) return true; return !['left','kicked','banned'].includes(data.result?.status); }catch{ return true; }
}

app.get('/api/user', async (req,res)=>{
  const id=req.query.userId; const username=req.query.username?decodeURIComponent(req.query.username):''; const firstName=req.query.firstName?decodeURIComponent(req.query.firstName):'';
  let u = await User.findOne({telegramId:id});
  if(!u){ u = await User.create({telegramId:id, balance:0.05, username, firstName, ad1Count:0, ad1Date:'', ad2Count:0, ad2Date:'', ad3Count:0, ad3Date:'', checkinCount:0, checkinDate:'', streak:0, referrals:[], referralLink:`https://t.me/${BOT_USERNAME}?start=${id}`}); }
  if(username) u.username=username; if(firstName) u.firstName=firstName;
  const today=getToday();
  if(u.ad1Date!==today){ u.ad1Count=0; u.ad1Date=today; } if(u.ad2Date!==today){ u.ad2Count=0; u.ad2Date=today; } if(u.ad3Date!==today){ u.ad3Count=0; u.ad3Date=today; } if(u.checkinDate!==today){ u.checkinCount=0; u.checkinDate=today; }
  await u.save(); res.json(u);
});

app.get('/api/check-join', async (req,res)=>{ const joined=await isUserInChannel(req.query.userId); res.json({joined, channel:MY_CHANNEL}); });

const adGalaxyUsed = new Set();
app.post('/api/adsgalaxy-confirm', async (req,res)=>{
  const {userId, request_id, event_id, adType}=req.body;
  if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`❌ Join ${MY_CHANNEL} first!`, needJoin:true, channel:MY_CHANNEL});
  const id=event_id||request_id; if(!id) return res.json({ok:false, msg:"No id"}); if(adGalaxyUsed.has(id)) return res.json({ok:false, msg:"Already credited"});
  let u=await User.findOne({telegramId:userId}); if(!u) return res.json({ok:false, msg:"User not found"});
  const today=getToday(); if(u.ad1Date!==today){ u.ad1Count=0; u.ad1Date=today; } if(u.ad2Date!==today){ u.ad2Count=0; u.ad2Date=today; } if(u.ad3Date!==today){ u.ad3Count=0; u.ad3Date=today; }
  let reward=0;
  if(adType==='ad1'){ if(u.ad1Count>=20) return res.json({ok:false, msg:"AD1 limit 20/20"}); u.ad1Count++; reward=0.005; }
  else if(adType==='ad2'){ if(u.ad2Count>=15) return res.json({ok:false, msg:"AD2 limit 15/15"}); u.ad2Count++; reward=0.005; }
  else if(adType==='ad3'){ if(u.ad3Count>=5) return res.json({ok:false, msg:"SPECIAL 5/5 done"}); u.ad3Count++; reward=0.01; }
  u.balance+=reward; adGalaxyUsed.add(id);
  if(checkAllAdsComplete(u)&&!u.completedDays.includes(today)){
    u.completedDays.push(today);
    if(u.referredBy){ let ref=await User.findOne({telegramId:u.referredBy}); if(ref){ let e=ref.referrals.find(r=>r.id===userId); if(!e){ e={id:userId, username:u.username, day1Complete:true, day1Date:today, day2Complete:false, valid:false}; ref.referrals.push(e); } else if(!e.valid){ if(!e.day1Complete){ e.day1Complete=true; e.day1Date=today; } else if(e.day1Date!==today){ e.day2Complete=true; e.day2Date=today; e.valid=true; ref.balance+=0.025; ref.referralEarnings+=0.025; ref.referralCount++; } } ref.markModified('referrals'); await ref.save(); } }
  }
  await u.save();
  const left=adType==='ad1'?20-u.ad1Count:adType==='ad2'?15-u.ad2Count:5-u.ad3Count;
  res.json({ok:true, reward, balance:u.balance, left});
});

app.post('/api/earn', async (req,res)=>{
  const {userId, amount, adType}=req.body;
  if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`Join ${MY_CHANNEL}`, needJoin:true});
  let u=await User.findOne({telegramId:userId}); if(!u) return res.json({ok:false});
  const today=getToday(); if(u.checkinDate!==today){ u.checkinCount=0; u.checkinDate=today; }
  if(adType.includes('check')){ if(u.checkinCount>=10) return res.json({ok:false, msg:"Limit 10/10"}); u.checkinCount++; if(u.checkinCount===1) u.streak++; }
  if(amount) u.balance+=parseFloat(amount); await u.save(); res.json({ok:true, balance:u.balance, checkinCount:u.checkinCount});
});

app.post('/api/withdraw', async (req,res)=>{
  const {userId, address, amount, network}=req.body;
  if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`Join ${MY_CHANNEL} to withdraw`, needJoin:true});
  let u=await User.findOne({telegramId:userId}); if(!u||u.balance<5) return res.json({ok:false, msg:"Min $5"});
  const amt=parseFloat(amount); const fee=amt*0.2; const rec=amt*0.8;
  const recDoc=await Withdraw.create({id:Date.now(), userId, amount:amt, fee, receive:rec, wallet:address, network, status:'Pending', date:new Date().toLocaleDateString()});
  u.balance-=amt; await u.save();
  if(bot){ ADMIN_IDS.forEach(aid=>{ bot.telegram.sendMessage(aid, `💸 NEW #${recDoc.id}\n$${amt}-> $${rec}\n${address}\n${network}`, Markup.inlineKeyboard([[Markup.button.callback('✅ Approve', `app_${recDoc.id}`), Markup.button.callback('❌ Reject', `rej_${recDoc.id}`)]])).catch(()=>{}); }); }
  res.json({ok:true, receive:rec});
});

app.post('/api/ai-chat', async (req,res)=>{ res.json({ok:true, reply:"I am AI - Balance $"+(await User.findOne({telegramId:req.body.userId}))?.balance}); });
app.post('/api/referral-join', async (req,res)=>{
  const {userId, referredBy, username, firstName}=req.body; if(!userId||!referredBy||userId===referredBy) return res.json({ok:false});
  let me=await User.findOne({telegramId:userId}); if(!me) me=await User.create({telegramId:userId, username, firstName, balance:0.05, referrals:[], referredBy});
  if(!me.referredBy) { me.referredBy=referredBy; await me.save(); }
  let ref=await User.findOne({telegramId:referredBy}); if(!ref) ref=await User.create({telegramId:referredBy, balance:0.05, referrals:[]});
  if(!ref.referrals.find(r=>r.id===userId)){ ref.referrals.push({id:userId, username, firstName, day1Complete:false, valid:false}); ref.markModified('referrals'); await ref.save(); }
  res.json({ok:true});
});

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||3000,()=>console.log('MongoDB Permanent Running'));
