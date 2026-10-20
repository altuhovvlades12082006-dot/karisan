export function animateSelection() {
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 document.querySelectorAll('.collection-tile.active, #fabric-options a.active').forEach(el=>{
  el.animate([{transform:'scale(.975)'},{transform:'scale(1)'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
 });
 [...document.querySelectorAll('#products .product')].slice(0,8).forEach((el,i)=>{
  el.animate([{opacity:.25,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{
   duration:300,delay:i*22,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'
  });
 });
}
