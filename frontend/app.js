const API="http://localhost:3000/api";let products=[];let cart=[];
const fmt=n=>Number(n).toLocaleString("fa-IR");
async function init(){try{const r=await fetch(API+"/products");products=await r.json();document.getElementById("productStatus").textContent=products.length+" محصول";renderProducts()}catch(e){document.getElementById("productStatus").textContent="اتصال به سرور برقرار نشد"}}
function renderProducts(){const el=document.getElementById("products");el.innerHTML=products.map(p=>`<article class="product"><div class="gem"><span class="soon-text">به‌زودی...</span>💎</div><h3>${p.name}</h3><div class="price">${fmt(p.price)} ${p.currency}</div><button onclick="add(${p.id})">افزودن به سبد</button></article>`).join("")}
function add(id){const x=cart.find(i=>i.productId===id);if(x)x.quantity++;else cart.push({productId:id,quantity:1});updateCart()}
function updateCart(){cartCount.textContent=cart.reduce((a,b)=>a+b.quantity,0);renderCart()}
function renderCart(){const box=document.getElementById("cartItems");if(!cart.length){box.innerHTML="<p>سبد خرید خالی است.</p>";cartTotal.textContent="0";return}let total=0;box.innerHTML=cart.map(i=>{const p=products.find(x=>x.id===i.productId);total+=p.price*i.quantity;return `<div class="cart-line"><span>${p.name} × ${i.quantity}</span><b>${fmt(p.price*i.quantity)}</b></div>`}).join("");cartTotal.textContent=fmt(total)}
function openCart(){cartModal.hidden=false;cartModal.style.display="grid";renderCart()}function closeCart(){cartModal.hidden=true;cartModal.style.display="none"}
async function submitOrder(){if(!cart.length)return cartMsg.textContent="سبد خرید خالی است.";if(!/^[A-Za-z0-9_-]{3,40}$/.test(playerId.value))return cartMsg.textContent="Player ID معتبر وارد کن.";const r=await fetch(API+"/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({playerId:playerId.value,items:cart})});const d=await r.json();if(!r.ok)return cartMsg.textContent=d.error||"خطا";cart=[];updateCart();cartMsg.innerHTML=`سفارش #${d.id} ثبت شد. <a href="checkout.html?order=${d.id}">ادامه به تسویه حساب</a>`;trackId.value=d.id}
async function trackOrder(){const id=trackId.value.trim();if(!id)return;const r=await fetch(API+"/orders/"+encodeURIComponent(id));const d=await r.json();trackResult.innerHTML=r.ok?`<div class="status">سفارش <b>#${d.id}</b> — وضعیت: <b>${d.status}</b> — مبلغ: ${fmt(d.total)} ${d.currency}</div>`:`<div class="status">${d.error||"سفارش پیدا نشد"}</div>`}
init();

const accounts=[
{id:1,title:"اکانت کلش رویال",level:"King Level 50",trophies:"7500",price:"تماس برای قیمت",image:"images/accounts/account1.jpg"},
{id:2,title:"اکانت کلش آف کلنز",level:"Town Hall 15",trophies:"5200",price:"تماس برای قیمت",image:"images/accounts/account2.jpg"}
];

function renderAccounts(){
 const el=document.getElementById("accountsGrid");
 if(!el)return;
 el.innerHTML=accounts.map(a=>`
 <article class="product account-card">
  <img class="account-img" src="${a.image}" alt="${a.title}">
  <h3>${a.title}</h3>
  <div class="price">${a.level}<br>🏆 ${a.trophies} جام</div>
  <button onclick="showAccount(${a.id})">مشاهده جزئیات</button>
 </article>`).join("");
}

function showAccount(id){
 const a=accounts.find(x=>x.id===id);
 if(!a)return;
 const box=document.getElementById("accountDetails");
 box.innerHTML=`
  <img class="account-detail-img" src="${a.image}" alt="${a.title}">
  <span class="eyebrow">ACCOUNT DETAILS</span>
  <h2>${a.title}</h2>
  <div class="account-info">
   <div><span>🎮 بازی</span><b>${a.title}</b></div>
   <div><span>⭐ سطح</span><b>${a.level}</b></div>
   <div><span>🏆 جام</span><b>${a.trophies}</b></div>
   <div><span>💰 قیمت</span><b>${a.price}</b></div>
  </div>
  <a class="primary full" href="https://t.me/" target="_blank">📱 ارتباط برای خرید</a>
 `;
 const modal=document.getElementById("accountModal");
 modal.hidden=false;
 modal.style.display="grid";
}

function closeAccount(){
 const modal=document.getElementById("accountModal");
 modal.hidden=true;
 modal.style.display="none";
}

renderAccounts();
