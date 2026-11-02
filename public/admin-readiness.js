let generation=0;
export function clearReadiness(){generation++;document.querySelector('#launch-readiness')?.remove();}
export function mountReadiness(){
  clearReadiness();const current=generation;
  const box=document.createElement('details');box.id='launch-readiness';box.className='launch-readiness';
  const summary=document.createElement('summary');summary.textContent='Готовність до запуску · перевіряємо…';
  const description=document.createElement('p');description.textContent='Ця перевірка стосується поточного середовища. Вона не підтверджує публікацію на домені. Хостинг, HTTPS і зовнішні сервіси потрібно перевірити перед запуском; купівля окремого VPS поки не потрібна.';
  const list=document.createElement('ul');list.setAttribute('aria-live','polite');
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Перевірити ще раз';
  box.append(summary,description,list,refresh);document.querySelector('.admin-tabs').after(box);
  async function load(){
    refresh.disabled=true;
    try{const response=await fetch('/api/admin/readiness',{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Перевірка недоступна');if(current!==generation)return;
      list.replaceChildren();let pending=0;
      for(const check of data.checks){if(!check.ready)pending++;const item=document.createElement('li');const heading=document.createElement('strong');heading.textContent=`${check.ready?'Працює':'Потребує уваги'} — ${check.label}`;const detail=document.createElement('p');detail.textContent=check.detail;item.append(heading,detail);list.append(item);}
      summary.textContent=`Готовність до запуску · ${pending?`${pending} пунктів потребують уваги`:'перевірки пройдено'}`;
    }catch(error){if(current===generation){summary.textContent='Готовність до запуску · перевірка недоступна';list.textContent=error.message;}}
    finally{if(current===generation)refresh.disabled=false;}
  }
  refresh.onclick=load;load();
}
