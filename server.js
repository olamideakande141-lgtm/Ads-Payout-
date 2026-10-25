import express from 'express';
import fs from 'fs';
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
let bot;
if(BOT_TOKEN){
  bot = new Telegraf(BOT_TOKEN);
  const MINI_APP_URL = process.env.MINI_APP_URL || 'https://ads-payout-1.onrender.com';
  bot.telegram.deleteWebhook({drop_pending_updates: true}).then(()=>console.log('Old webhook deleted')).catch(()=>{});
  bot.start((ctx)=>{
    const refId = ctx.startPayload; // referral id from t.me/bot?start=REFID
    if(refId){
      try{
        if(!fs.existsSync('./data.json')) fs.writeFileSync('./data.json','{}');
        let tempUsers = JSON.parse(fs.readFileSync('./data.json'));
        const uid = String(ctx.from.id);
        if(!tempUsers[uid]) tempUsers[uid] = {balance:0,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',referrals:[],referralEarnings:0,referredBy:refId,completedDays:[]};
        else if(!tempUsers[uid].referredBy && refId!==uid){
          tempUsers[uid].referredBy = refId;
        }
        // Add to referrer tracking
        if(refId!==uid){
          if(!tempUsers[refId]) tempUsers[refId] = {balance:0,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',referrals:[],referralEarnings:0,completedDays:[],referralLink:`https://t.me/${process.env.BOT_USERNAME||'AdsPayoutBot'}?start=${refId}`};
          if(!tempUsers[refId].referrals) tempUsers[refId].referrals=[];
          if(!tempUsers[refId].referrals.find(r=>r.id===uid)){
            tempUsers[refId].referrals.push({id:uid, username:ctx.from.username||'', day1Complete:false, day1Date:'', day2Complete:false, day2Date:'', valid:false, date:new Date().toISOString()});
          }
        }
        fs.writeFileSync('./data.json', JSON.stringify(tempUsers));
      }catch(e){console.log(e)}
    }

    const txt=`What can this bot do?\n\n💎 Why USDT Earn is Different\n\nMany bots promise to pay, but they don't.\nMany say 24 hours, but you wait forever.\n\nWe are different.\n\n⚡ At USDT Earn, withdrawals arrive in MINUTES.\n💰 Real USDT - TRC20 / BEP20\n✅ No delays, no stories\n\nMinimum: $5 USDT (20% fee)\nYou withdraw $5 → Get $4 in 1 minute!\n\nReferral: Earn $0.025 per valid referral\nValid = referral completes ALL ads (20+15+20) for 2 days\n\nPlease:\n🙏 No fake referrals\n🙏 Complete 20 tasks daily\n🙏 Stay active ${MY_CHANNEL}\n\nReal users = Fast payments. Always`;
    ctx.reply(txt, Markup.inlineKeyboard([[Markup.button.webApp('🚀 Launch Mini App', MINI_APP_URL)], [Markup.button.url('📢 Join Channel', `https://t.me/${MY_CHANNEL.replace('@','')}`)]]));
  });
  bot.launch().then(()=>console.log('Bot running')).catch(e=>console.log(e));
}

let users = {};
let tasks = [];
let withdraws = [];
try{ if(fs.existsSync('./data.json')) users = JSON.parse(fs.readFileSync('./data.json')); }catch(e){}
try{ if(fs.existsSync('./tasks.json')) tasks = JSON.parse(fs.readFileSync('./tasks.json')); }catch(e){}
try{ if(fs.existsSync('./withdraws.json')) withdraws = JSON.parse(fs.readFileSync('./withdraws.json')); }catch(e){}

if(tasks.length===0){
  tasks=[
    {id:1, title:"WATCH AD #1", reward:"0.005", link:"ad1"},
    {id:2, title:"WATCH AD #2", reward:"0.005", link:"ad2"},
    {id:3, title:`JOIN ${MY_CHANNEL}`, reward:"0.01", link:`https://t.me/${MY_CHANNEL.replace('@','')}`}
  ];
}
const save = ()=>fs.writeFileSync('./data.json', JSON.stringify(users));
const saveTasks = ()=>fs.writeFileSync('./tasks.json', JSON.stringify(tasks));
const saveWithdraws = ()=>fs.writeFileSync('./withdraws.json', JSON.stringify(withdraws));
function getToday(){ return new Date().toDateString(); }
function checkAllAdsComplete(u){
  return (u.ad1Count>=20 && u.ad2Count>=15 && u.ad3Count>=20);
}

app.get('/api/user',(req,res)=>{
  const id=req.query.userId;
  const botUsername=process.env.BOT_USERNAME||'AdsPayoutBot';
  if(!users[id]){ 
    users[id]={
      balance:0,
      tasksCompleted:[],
      referralCount:0,
      ad1Count:0,ad1Date:'',
      ad2Count:0,ad2Date:'',
      ad3Count:0,ad3Date:'',
      referrals:[],
      referralEarnings:0,
      referredBy:'',
      completedDays:[],
      referralLink:`https://t.me/${botUsername}?start=${id}`
    }; 
    save(); 
  }
  // init missing fields for old users
  if(users[id].ad3Count===undefined){ users[id].ad3Count=0; users[id].ad3Date=''; }
  if(!users[id].referrals) users[id].referrals=[];
  if(users[id].referralEarnings===undefined) users[id].referralEarnings=0;
  if(!users[id].completedDays) users[id].completedDays=[];

  const today=getToday();
  if(users[id].ad1Date!==today){ users[id].ad1Count=0; users[id].ad1Date=today; }
  if(users[id].ad2Date!==today){ users[id].ad2Count=0; users[id].ad2Date=today; }
  if(users[id].ad3Date!==today){ users[id].ad3Count=0; users[id].ad3Date=today; }
  save();
  res.json(users[id]);
});

app.get('/api/tasks',(req,res)=>res.json(tasks));

app.post('/api/complete-task', async (req,res)=>{
  const {userId, taskId}=req.body;
  if(!users[userId]) users[userId]={balance:0,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',referrals:[],referralEarnings:0,completedDays:[]};
  if(users[userId].tasksCompleted.includes(taskId)) return res.json({ok:false, msg:"Already claimed"});
  const task=tasks.find(t=>t.id==taskId);
  if(!task) return res.json({ok:false, msg:"Task not found"});
  if(task.link && task.link.includes('t.me/')){
    try{
      let raw=task.link.replace('https://t.me/','').replace('http://t.me/','').replace('t.me/','').replace('@','');
      let username=raw.split('/')[0].split('?')[0];
      if(username && !username.includes('+') && !username.includes('joinchat') && BOT_TOKEN){
        const chatId='@'+username;
        const resp=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${userId}`);
        const data=await resp.json();
        if(!data.ok || ['left','kicked'].includes(data.result?.status)){
          return res.json({ok:false, msg:`❌ You must JOIN ${chatId} first!`});
        }
      }
    }catch(e){console.log(e);}
  }
  users[userId].tasksCompleted.push(taskId);
  users[userId].balance+=parseFloat(task.reward);
  save();
  res.json({ok:true, balance:users[userId].balance});
});

app.post('/api/earn',(req,res)=>{
  const {userId, amount, adType}=req.body;
  if(!users[userId]) users[userId]={balance:0,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',referrals:[],referralEarnings:0,completedDays:[]};
  const today=getToday();
  if(users[userId].ad1Date!==today){ users[userId].ad1Count=0; users[userId].ad1Date=today; }
  if(users[userId].ad2Date!==today){ users[userId].ad2Count=0; users[userId].ad2Date=today; }
  if(users[userId].ad3Date!==today){ users[userId].ad3Count=0; users[userId].ad3Date=today; }

  if(adType==='ad1'){ if(users[userId].ad1Count>=20) return res.json({ok:false, msg:"❌ Ad #1 limit 20/day reached!"}); users[userId].ad1Count++; }
  if(adType==='ad2'){ if(users[userId].ad2Count>=15) return res.json({ok:false, msg:"❌ Ad #2 limit 15/day reached!"}); users[userId].ad2Count++; }
  if(adType==='ad3'){ if(users[userId].ad3Count>=20) return res.json({ok:false, msg:"❌ Special Ad limit 20/day reached!"}); users[userId].ad3Count++; }

  users[userId].balance+=parseFloat(amount);

  // === REFERRAL TRACKING: Check if user completed ALL ads today ===
  if(checkAllAdsComplete(users[userId])){
    if(!users[userId].completedDays.includes(today)){
      users[userId].completedDays.push(today);
      // If this user was referred by someone, update referrer tracking
      let refBy = users[userId].referredBy;
      if(refBy && users[refBy]){
        if(!users[refBy].referrals) users[refBy].referrals=[];
        let refEntry = users[refBy].referrals.find(r=>r.id===userId);
        if(!refEntry){
          refEntry={id:userId, day1Complete:true, day1Date:today, day2Complete:false, day2Date:'', valid:false, date:new Date().toISOString()};
          users[refBy].referrals.push(refEntry);
        } else if(!refEntry.valid){
          if(!refEntry.day1Complete){
            refEntry.day1Complete=true;
            refEntry.day1Date=today;
          } else if(refEntry.day1Date!==today && !refEntry.day2Complete){
            refEntry.day2Complete=true;
            refEntry.day2Date=today;
            refEntry.valid=true;
            // PAY REFERRER $0.025
            users[refBy].balance+=0.025;
            users[refBy].referralEarnings=(users[refBy].referralEarnings||0)+0.025;
            users[refBy].referralCount=(users[refBy].referralCount||0)+1;
          }
        }
      }
    }
  }

  save();
  res.json({ok:true, balance:users[userId].balance, ad1Count:users[userId].ad1Count, ad2Count:users[userId].ad2Count, ad3Count:users[userId].ad3Count});
});

// === NEW REFERRAL ENDPOINT FOR WEB APP (mini app) ===
app.post('/api/referral-join',(req,res)=>{
  const {userId, referredBy}=req.body;
  if(!userId || !referredBy || userId===referredBy) return res.json({ok:false});
  if(!users[userId]) users[userId]={balance:0,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',referrals:[],referralEarnings:0,completedDays:[],referredBy:''};
  if(!users[referredBy]) users[referredBy]={balance:0,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',referrals:[],referralEarnings:0,completedDays:[],referralLink:`https://t.me/${process.env.BOT_USERNAME||'AdsPayoutBot'}?start=${referredBy}`};

  if(!users[userId].referredBy){
    users[userId].referredBy=referredBy;
  }
  if(!users[referredBy].referrals) users[referredBy].referrals=[];
  if(!users[referredBy].referrals.find(r=>r.id===userId)){
    users[referredBy].referrals.push({id:userId, day1Complete:false, day1Date:'', day2Complete:false, day2Date:'', valid:false, date:new Date().toISOString()});
  }
  save();
  res.json({ok:true});
});

app.post('/api/withdraw',(req,res)=>{
  const {userId, wallet, address, cryptoType, network, amount}=req.body;
  const finalWallet = wallet || address;
  const finalNetwork = network || cryptoType || 'BEP20';
  const withdrawAmount = amount ? parseFloat(amount) : users[userId]?.balance;

  if(!users[userId]) return res.json({ok:false, msg:"User not found"});
  if(users[userId].balance<5) return res.json({ok:false, msg:"❌ Minimum $5.00 USDT required! Keep earning. You need $5 to withdraw. 20% fee applies."});
  if(!finalWallet) return res.json({ok:false, msg:"Enter wallet address"});
  if(withdrawAmount < 5) return res.json({ok:false, msg:"❌ Minimum $5 required"});
  if(withdrawAmount > users[userId].balance) return res.json({ok:false, msg:"Insufficient balance"});

  const totalAmount=withdrawAmount;
  const fee=totalAmount*0.20;
  const receiveAmount=totalAmount*0.80;
  const record={
    id:Date.now(),
    userId,
    amount:totalAmount,
    fee:fee,
    receive:receiveAmount,
    wallet:finalWallet,
    cryptoType:finalNetwork,
    network:finalNetwork,
    status:"Pending",
    date:new Date().toLocaleDateString()
  };
  withdraws.push(record); saveWithdraws();
  users[userId].balance-=totalAmount; save();
  res.json({ok:true, msg:`✅ Withdraw $${totalAmount.toFixed(4)} sent! You receive $${receiveAmount.toFixed(4)} after 20% fee on ${finalNetwork}. Arrives in 1 minute!`, receive:receiveAmount, total:totalAmount});
});

app.get('/api/withdraws',(req,res)=>{
  const id=req.query.userId;
  res.json(withdraws.filter(w=>w.userId==id).reverse());
});

app.post('/api/add-task',(req,res)=>{
  const {title,reward,link}=req.body;
  tasks.push({id:Date.now(),title,reward,link});
  saveTasks();
  res.json({ok:true});
});

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||3000,()=>console.log('Running'));
