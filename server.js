const express = require('express');
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const app = express();
app.use(express.json());
app.use(express.static('public'));

const BOT_TOKEN = process.env.BOT_TOKEN;
let bot;
if(BOT_TOKEN){
  bot = new Telegraf(BOT_TOKEN);
  const MINI_APP_URL = process.env.MINI_APP_URL || 'https://ads-payout-1.onrender.com';
  const CHANNEL = '@freeearningofusdt';
  bot.start((ctx)=>{
    const txt=`What can this bot do?\n\n💎 Why USDT Earn is Different\n\nMany bots promise to pay, but they don't.\nMany say 24 hours, but you wait forever.\n\nWe are different.\n\n⚡ At USDT Earn, withdrawals arrive in MINUTES.\n💰 Real USDT - TRC20 / BEP20\n✅ No delays, no stories\n\nPlease:\n🙏 No fake referrals\n🙏 Complete 20 tasks daily\n🙏 Stay active ${CHANNEL}\n\nReal users = Fast payments. Always`;
    ctx.reply(txt, Markup.inlineKeyboard([[Markup.button.webApp('🚀 Launch Mini App', MINI_APP_URL)], [Markup.button.url('📢 Join Channel', `https://t.me/${CHANNEL.replace('@','')}`)]]));
  });
  bot.launch().then(()=>console.log('Bot running')).catch(e=>console.log('Bot launch error', e));
}

let users = {};
let tasks = [];
let withdraws = [];
try{ if(fs.existsSync('./data.json')) users = JSON.parse(fs.readFileSync('./data.json')); }catch(e){}
try{ if(fs.existsSync('./tasks.json')) tasks = JSON.parse(fs.readFileSync('./tasks.json')); }catch(e){}
try{ if(fs.existsSync('./withdraws.json')) withdraws = JSON.parse(fs.readFileSync('./withdraws.json')); }catch(e){}

if(tasks.length===0){
  tasks=[
    {id:1, title:"WATCH AD #1", reward:"0.002", link:"ad1"},
    {id:2, title:"WATCH AD #2", reward:"0.002", link:"ad2"},
    {id:3, title:"JOIN @freeearningofusdt", reward:"0.01", link:"https://t.me/freeearningofusdt"}
  ];
}

const save = ()=>fs.writeFileSync('./data.json', JSON.stringify(users));
const saveTasks = ()=>fs.writeFileSync('./tasks.json', JSON.stringify(tasks));
const saveWithdraws = ()=>fs.writeFileSync('./withdraws.json', JSON.stringify(withdraws));

app.get('/api/user',(req,res)=>{
  const id=req.query.userId;
  const botUsername=process.env.BOT_USERNAME||'AdsPayoutBot';
  if(!users[id]){ users[id]={balance:0,tasksCompleted:[],referralCount:0,referralLink:`https://t.me/${botUsername}?start=${id}`}; save(); }
  res.json(users[id]);
});

app.get('/api/tasks',(req,res)=>res.json(tasks));

app.post('/api/complete-task', async (req,res)=>{
  const {userId, taskId}=req.body;
  if(!users[userId]) users[userId]={balance:0,tasksCompleted:[],referralCount:0};
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
  const {userId, amount}=req.body;
  if(!users[userId]) users[userId]={balance:0,tasksCompleted:[],referralCount:0};
  users[userId].balance+=parseFloat(amount);
  save();
  res.json({ok:true, balance:users[userId].balance});
});

app.post('/api/withdraw',(req,res)=>{
  const {userId, wallet, cryptoType}=req.body;
  if(!users[userId]) return res.json({ok:false, msg:"User not found"});
  if(users[userId].balance<0.1) return res.json({ok:false, msg:"Min $0.10"});
  if(!wallet) return res.json({ok:false, msg:"Enter wallet"});
  const record={id:Date.now(),userId,amount:users[userId].balance,wallet,cryptoType,status:"Pending",date:new Date().toLocaleDateString()};
  withdraws.push(record); saveWithdraws();
  users[userId].balance=0; save();
  res.json({ok:true, msg:"✅ Withdraw sent! Paid in minutes."});
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
