import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN;
const MY_CHANNEL = process.env.CHANNEL || '@freeearningofusdt';
const BOT_USERNAME = process.env.BOT_USERNAME || 'Realads01_bot';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://ads-payout-1.onrender.com';

// === YOUR CLUSTER - NO MORE RESET ===
const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://olamideakande141_db_user:zWbfpDTHVxaxT3IU@cluster0.3hmnm5x.mongodb.net/ads_payout?retryWrites=true&w=majority';

mongoose.connect(MONGO_URL).then(()=>{
  console.log("✅ MongoDB Connected to cluster0.3hmnm5x - BALANCE FIXED FOREVER");
}).catch(e=>console.log("Mongo error:", e.message));

const UserSchema = new mongoose.Schema({
  _id: String, balance: {type:Number, default:0.05},
  ad1Count:{type:Number, default:0}, ad1Date:String,
  ad2Count:{type:Number, default:0}, ad2Date:String,
  ad3Count:{type:Number, default:0}, ad3Date:String,
  checkinCount:{type:Number, default:0}, checkinDate:String, lastCheckinDate:String, streak:{type:Number, default:0},
  referrals:{type:Array, default:[]}, referralEarnings:{type:Number, default:0}, referralCount:{type:Number, default:0},
  referredBy:String, completedDays:{type:Array, default:[]},
  username:String, firstName:String, telegramId:String, referralLink:String, lastNetwork:String
});
const WithdrawSchema = new mongoose.Schema({
  id:Number, userId:String, amount:Number, fee:Number, receive:Number, wallet:String, network:String, status:String, date:String
});
const User = mongoose.model('User', UserSchema);
const Withdraw = mongoose.model('Withdraw', WithdrawSchema);

let bot;
if(BOT_TOKEN){
  bot = new Telegraf(BOT_TOKEN);
  bot.telegram.deleteWebhook({drop_pending_updates: true}).catch(()=>{});
  bot.start(async (ctx)=>{
    const uid = String(ctx.from.id);
    const refId = ctx.startPayload;
    const username = ctx.from.username ? '@'+ctx.from.username : '';
    const firstName = ctx.from.first_name || '';
    let user = await User.findById(uid);
    if(!user){
      user = await User.create({_id:uid, balance:0.05, username, firstName, telegramId:uid, referralLink:`https://t.me/${BOT_USERNAME}?start=${uid}`, referredBy:refId||''});
    }
    ctx.reply(`💎 ADS PAYOUT - BALANCE FIXED FOREVER\n\nYour balance is now saved in MangoDB ${uid}\nNo more reset on deploy!\n\nLink: https://t.me/${BOT_USERNAME}?start=${uid}`, Markup.inlineKeyboard([
      [Markup.button.webApp('🚀 Launch Ads Payout', MINI_APP_URL)],
      [Markup.button.url('📢 Join Channel', `https://t.me/${MY_CHANNEL.replace('@','')}`)]
    ]));
  });
  bot.launch().then(()=>console.log('Bot @'+BOT_USERNAME)).catch(console.log);
}

function getToday(){ return new Date().toDateString(); }
function checkAllAdsComplete(u){ return (u.ad1Count>=20 && u.ad2Count>=15 && u.ad3Count>=5); }
async function isUserInChannel(userId){
  try{
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${MY_CHANNEL}&user_id=${userId}`);
    const d = await r.json(); return !['left','kicked','banned'].includes(d.result?.status);
  }catch{return true;}
}

app.get('/api/user', async (req,res)=>{
  let user = await User.findById(req.query.userId);
  if(!user) user = await User.create({_id:req.query.userId, balance:0.05, telegramId:req.query.userId});
  const today=getToday();
  if(user.ad1Date!==today){ user.ad1Count=0; user.ad1Date=today; }
  if(user.ad2Date!==today){ user.ad2Count=0; user.ad2Date=today; }
  if(user.ad3Date!==today){ user.ad3Count=0; user.ad3Date=today; }
  if(user.checkinDate!==today){ user.checkinCount=0; user.checkinDate=today; }
  await user.save(); res.json(user);
});
app.get('/api/check-join', async (req,res)=>{ res.json({joined: await isUserInChannel(req.query.userId), channel:MY_CHANNEL}); });

const used = new Set();
app.post('/api/adsgalaxy-confirm', async (req,res)=>{
  const {userId, request_id, event_id, adType}=req.body;
  const id=event_id||request_id;
  if(used.has(id)) return res.json({ok:false, msg:"Already credited"});
  let user = await User.findById(userId);
  if(!user) return res.json({ok:false, msg:"User not found"});
  const today=getToday();
  if(user.ad1Date!==today){ user.ad1Count=0; user.ad1Date=today; }
  if(user.ad2Date!==today){ user.ad2Count=0; user.ad2Date=today; }
  if(user.ad3Date!==today){ user.ad3Count=0; user.ad3Date=today; }
  let reward=0;
  if(adType==='ad1'){ if(user.ad1Count>=20) return res.json({ok:false, msg:"AD1 done"}); user.ad1Count++; reward=0.005; }
  else if(adType==='ad2'){ if(user.ad2Count>=15) return res.json({ok:false, msg:"AD2 done"}); user.ad2Count++; reward=0.005; }
  else { if(user.ad3Count>=5) return res.json({ok:false, msg:"SPECIAL done"}); user.ad3Count++; reward=0.01; }
  user.balance+=reward; used.add(id); await user.save();
  res.json({ok:true, reward, balance:user.balance, left: adType==='ad1'?20-user.ad1Count:adType==='ad2'?15-user.ad2Count:5-user.ad3Count});
});

app.post('/api/earn', async (req,res)=>{
  let user = await User.findById(req.body.userId);
  if(!user) return res.json({ok:false});
  const today=getToday();
  if(user.checkinDate!==today){ user.checkinCount=0; user.checkinDate=today; }
  if(user.checkinCount>=10) return res.json({ok:false, msg:"10/day limit"});
  user.checkinCount++; user.balance+=parseFloat(req.body.amount||0.01); await user.save();
  res.json({ok:true, balance:user.balance});
});

app.post('/api/withdraw', async (req,res)=>{
  let user = await User.findById(req.body.userId);
  if(user.balance<5) return res.json({ok:false, msg:"Min $5"});
  const amt=parseFloat(req.body.amount); const fee=amt*0.2, rec=amt*0.8;
  await Withdraw.create({id:Date.now(), userId:req.body.userId, amount:amt, fee, receive:rec, wallet:req.body.address, network:req.body.network||'BEP20', status:"Pending", date:new Date().toLocaleDateString()});
  user.balance-=amt; await user.save();
  res.json({ok:true, msg:`Withdraw $${amt} → $${rec}`});
});

app.get('/api/withdraws', async (req,res)=>{ res.json(await Withdraw.find({userId:req.query.userId}).sort({_id:-1})); });
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||3000,()=>console.log('ADS PAYOUT RUNNING - MONGO FIXED cluster0.3hmnm5x'));
