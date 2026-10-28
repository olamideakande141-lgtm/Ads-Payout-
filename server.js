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
const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://olamideakande141_db_user:zWbfpDTHVxaxT3IU@cluster0.3hmnm5x.mongodb.net/ads_payout?retryWrites=true&w=majority';

mongoose.connect(MONGO_URL).then(()=>console.log("✅ MongoDB Connected - FIXED")).catch(e=>console.log(e));

const UserSchema = new mongoose.Schema({
  _id: String, balance: {type:Number, default:0.05},
  tasksCompleted: {type:Array, default:[]}, referralCount:{type:Number, default:0},
  ad1Count:{type:Number, default:0}, ad1Date:String, ad2Count:{type:Number, default:0}, ad2Date:String,
  ad3Count:{type:Number, default:0}, ad3Date:String, checkinCount:{type:Number, default:0}, checkinDate:String,
  lastCheckinDate:String, streak:{type:Number, default:0}, referrals:{type:Array, default:[]},
  referralEarnings:{type:Number, default:0}, referredBy:String, completedDays:{type:Array, default:[]},
  username:String, firstName:String, telegramId:String, referralLink:String, botUsername:String, lastNetwork:String
}, {strict:false});
const WithdrawSchema = new mongoose.Schema({
  id:Number, userId:String, amount:Number, fee:Number, receive:Number, wallet:String, cryptoType:String, network:String, status:String, date:String
}, {strict:false});

const User = mongoose.model('User', UserSchema);
const Withdraw = mongoose.model('Withdraw', WithdrawSchema);

let bot;
if(BOT_TOKEN){
  bot = new Telegraf(BOT_TOKEN);
  bot.telegram.deleteWebhook({drop_pending_updates: true}).catch(()=>{});
  bot.start(async (ctx)=>{
    const uid = String(ctx.from.id); const refId = ctx.startPayload;
    const username = ctx.from.username ? '@'+ctx.from.username : '';
    const firstName = ctx.from.first_name || '';
    let u = await User.findById(uid);
    if(!u) u = await User.create({_id:uid, balance:0.05, username, firstName, telegramId:uid, referralLink:`https://t.me/${BOT_USERNAME}?start=${uid}`, referredBy:refId||''});
    ctx.reply(`💎 ADS PAYOUT\n\nMin $5 (20% fee)\nLink: https://t.me/${BOT_USERNAME}?start=${uid}\nStay active ${MY_CHANNEL}`, Markup.inlineKeyboard([
      [Markup.button.webApp('🚀 Launch Ads Payout', MINI_APP_URL)],
      [Markup.button.url('📢 Join Channel', `https://t.me/${MY_CHANNEL.replace('@','')}`)]
    ]));
  });
  bot.launch().then(()=>console.log('Bot @'+BOT_USERNAME));
}

function getToday(){ return new Date().toDateString(); }
function checkAllAdsComplete(u){ return (u.ad1Count>=20 && u.ad2Count>=15 && u.ad3Count>=5); }
async function isUserInChannel(userId){
  if(!BOT_TOKEN) return true;
  try{
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${MY_CHANNEL}&user_id=${userId}`);
    const d = await r.json(); if(!d.ok) return true; return !['left','kicked','banned'].includes(d.result?.status);
  }catch{return true;}
}
function getSmartAIReply(msg, userData){
  const m = (msg||'').toLowerCase(); const bal=userData?.balance||0;
  if(m.includes('balance')) return `Balance $${bal.toFixed(4)}`;
  return `Balance $${bal.toFixed(4)} Ads: ${userData?.ad1Count||0}/20, ${userData?.ad2Count||0}/15, ${userData?.ad3Count||0}/5`;
}

// === FIXED API ===
app.get('/api/user', async (req,res)=>{
  try{
    const id=req.query.userId; const username=req.query.username?decodeURIComponent(req.query.username):''; const firstName=req.query.firstName?decodeURIComponent(req.query.firstName):'';
    let user = await User.findById(id);
    if(!user) user = await User.create({_id:id, balance:0.05, username, firstName, telegramId:id, referralLink:`https://t.me/${BOT_USERNAME}?start=${id}`, botUsername:BOT_USERNAME});
    if(username) user.username=username; if(firstName) user.firstName=firstName;
    user.telegramId=id; user.referralLink=`https://t.me/${BOT_USERNAME}?start=${id}`; user.botUsername=BOT_USERNAME;
    if(!user.referrals) user.referrals=[];
    const today=getToday();
    if(user.ad1Date!==today){ user.ad1Count=0; user.ad1Date=today; }
    if(user.ad2Date!==today){ user.ad2Count=0; user.ad2Date=today; }
    if(user.ad3Date!==today){ user.ad3Count=0; user.ad3Date=today; }
    if(user.checkinDate!==today){ user.checkinCount=0; user.checkinDate=today; }
    await user.save(); res.json(user);
  }catch(e){ console.log(e); res.json({balance:0.05, ad1Count:0, ad2Count:0, ad3Count:0, checkinCount:0}); }
});

app.get('/api/check-join', async (req,res)=>{
  try{ res.json({joined: await isUserInChannel(req.query.userId), channel:MY_CHANNEL}); }
  catch{ res.json({joined:true}); }
});

app.get('/api/tasks', (req,res)=>res.json([]));

const adGalaxyUsed = new Set();

app.post('/api/earn', async (req,res)=>{
  try{
    const {userId, amount, adType}=req.body;
    if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`❌ You must JOIN ${MY_CHANNEL} to earn!`, needJoin:true});
    let user = await User.findById(userId); if(!user) return res.json({ok:false, msg:"User not found"});
    const today=getToday();
    if(user.ad1Date!==today){ user.ad1Count=0; user.ad1Date=today; }
    if(user.ad2Date!==today){ user.ad2Count=0; user.ad2Date=today; }
    if(user.ad3Date!==today){ user.ad3Count=0; user.ad3Date=today; }
    if(user.checkinDate!==today){ user.checkinCount=0; user.checkinDate=today; }
    if(adType==='checkin' || adType==='check-in' || adType==='daily'){
      if(user.checkinCount>=10) return res.json({ok:false, msg:"❌ Daily Check-in limit 10/day reached!"});
      user.checkinCount++; user.lastCheckinDate=today; if(user.checkinCount===1) user.streak=(user.streak||0)+1;
    } else { return res.json({ok:false, msg:"Use Ads Galaxy button"}); }
    if(amount) user.balance+=parseFloat(amount);
    await user.save();
    return res.json({ok:true, balance:user.balance, ad1Count:user.ad1Count, ad2Count:user.ad2Count, ad3Count:user.ad3Count, checkinCount:user.checkinCount, streak:user.streak});
  }catch(e){ console.log(e); res.json({ok:false, msg:"Server error"}); }
});

app.post('/api/adsgalaxy-confirm', async (req,res)=>{
  try{
    const {userId, request_id, event_id, adType}=req.body;
    if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`❌ You left ${MY_CHANNEL}! Join channel to earn!`, needJoin:true, channel:MY_CHANNEL});
    const id = event_id || request_id;
    if(!id) return res.json({ok:false, msg:"No request_id"});
    if(adGalaxyUsed.has(id)) return res.json({ok:false, msg:"Already credited"});
    let user = await User.findById(userId);
    if(!user) return res.json({ok:false, msg:"User not found"});
    const today=getToday();
    if(user.ad1Date!==today){ user.ad1Count=0; user.ad1Date=today; }
    if(user.ad2Date!==today){ user.ad2Count=0; user.ad2Date=today; }
    if(user.ad3Date!==today){ user.ad3Count=0; user.ad3Date=today; }
    let reward=0;
    if(adType==='ad1'){ if(user.ad1Count>=20) return res.json({ok:false, msg:"❌ AD1 limit 20/day reached!"}); user.ad1Count++; reward=0.005; }
    else if(adType==='ad2'){ if(user.ad2Count>=15) return res.json({ok:false, msg:"❌ AD2 limit 15/day reached!"}); user.ad2Count++; reward=0.005; }
    else if(adType==='ad3'){ if(user.ad3Count>=5) return res.json({ok:false, msg:"❌ SPECIAL limit 5/day reached! 5/5 done"}); user.ad3Count++; reward=0.01; }
    else return res.json({ok:false, msg:"Invalid adType"});
    user.balance+=reward; adGalaxyUsed.add(id);
    // referral 2-day logic
    if(checkAllAdsComplete(user) && !user.completedDays.includes(today)){
      user.completedDays.push(today);
      if(user.referredBy){
        let ref = await User.findById(user.referredBy);
        if(ref){
          let entry = ref.referrals.find(r=>r.id===userId);
          if(!entry){ ref.referrals.push({id:userId, day1Complete:true, day1Date:today, day2Complete:false, valid:false}); }
          else if(!entry.valid){ if(!entry.day1Complete){ entry.day1Complete=true; entry.day1Date=today; } else if(entry.day1Date!==today){ entry.day2Complete=true; entry.valid=true; ref.balance+=0.025; ref.referralEarnings=(ref.referralEarnings||0)+0.025; ref.referralCount=(ref.referralCount||0)+1; } }
          ref.markModified('referrals'); await ref.save();
        }
      }
    }
    await user.save();
    const left = adType==='ad1'?20-user.ad1Count:adType==='ad2'?15-user.ad2Count:5-user.ad3Count;
    return res.json({ok:true, reward, balance:user.balance, left});
  }catch(e){ console.log("adsgalaxy error", e); return res.json({ok:false, msg:"Server error, try again"}); }
});

app.post('/api/adsgalaxy-webhook', (req,res)=>{ console.log("Webhook", req.body); res.json({ok:true}); });

app.post('/api/referral-join', async (req,res)=>{
  try{
    const {userId, referredBy}=req.body; if(!userId||!referredBy||userId===referredBy) return res.json({ok:false});
    let u = await User.findById(userId); if(!u) u=await User.create({_id:userId, balance:0.05, referredBy});
    if(!u.referredBy){ u.referredBy=referredBy; await u.save(); }
    let ref = await User.findById(referredBy); if(ref && !ref.referrals.find(r=>r.id===userId)){ ref.referrals.push({id:userId, valid:false, date:new Date().toISOString()}); await ref.save(); }
    res.json({ok:true});
  }catch{ res.json({ok:false}); }
});

app.post('/api/withdraw', async (req,res)=>{
  try{
    const {userId, wallet, address, amount, network}=req.body;
    if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`❌ You left ${MY_CHANNEL}! Re-join`, needJoin:true});
    let user = await User.findById(userId); if(!user) return res.json({ok:false, msg:"User not found"});
    if(user.balance<5) return res.json({ok:false, msg:"❌ Minimum $5.00 USDT required!"});
    if(amount>user.balance) return res.json({ok:false, msg:"Insufficient balance"});
    const finalWallet = wallet||address; if(!finalWallet) return res.json({ok:false, msg:"Enter wallet"});
    const total=parseFloat(amount); const fee=total*0.20, receive=total*0.80;
    await Withdraw.create({id:Date.now(), userId, amount:total, fee, receive, wallet:finalWallet, network:network||'BEP20', status:"Pending", date:new Date().toLocaleDateString()});
    user.balance-=total; await user.save();
    res.json({ok:true, msg:`✅ Withdraw $${total.toFixed(4)} sent! You receive $${receive.toFixed(4)}`, receive, total});
  }catch(e){ console.log(e); res.json({ok:false, msg:"Withdraw error"}); }
});

app.get('/api/withdraws', async (req,res)=>{ try{ res.json(await Withdraw.find({userId:req.query.userId}).sort({_id:-1})); }catch{ res.json([]); } });
app.post('/api/ai-chat', async (req,res)=>{ try{ const u=await User.findById(req.body.userId); res.json({ok:true, reply:getSmartAIReply(req.body.message, u)}); }catch{ res.json({ok:true, reply:"AI error"}); } });
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||3000,()=>console.log('Running ADS PAYOUT - MongoDB + Buttons FIXED'));
