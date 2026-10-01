const API="http://localhost:3000/api";

const params=new URLSearchParams(location.search);
const orderId=params.get("order");

const oid=document.getElementById("oid");
const amount=document.getElementById("amount");
const state=document.getElementById("state");
const msg=document.getElementById("msg");

oid.textContent=orderId||"-";

async function load(){
  if(!orderId){
    msg.textContent="شماره سفارش وجود ندارد.";
    return;
  }

  try{
    const r=await fetch(API+"/orders/"+encodeURIComponent(orderId));
    const d=await r.json();

    if(!r.ok){
      msg.textContent=d.error||"سفارش پیدا نشد.";
      return;
    }

    amount.textContent=Number(d.total).toLocaleString()+" "+d.currency;
    state.textContent=d.status;
  }catch(e){
    msg.textContent="اتصال به سرور برقرار نشد.";
  }
}

async function startPayment(){
  if(!orderId)return;

  const r=await fetch(API+"/payments/create",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({orderId:Number(orderId)})
  });

  const d=await r.json();

  if(!r.ok){
    msg.textContent=d.error||"خطا";
    return;
  }

  if(d.checkoutUrl){
    location.href=d.checkoutUrl;
  }else{
    msg.textContent="درگاه پرداخت هنوز به سیستم متصل نشده است.";
  }
}

load();
