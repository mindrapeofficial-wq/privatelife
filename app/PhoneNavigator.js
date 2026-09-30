'use client';

import { useEffect } from 'react';

export default function PhoneNavigator(){
  useEffect(()=>{
    const handler=(event)=>{
      const app=event.target.closest?.('.app');
      if(!app)return;
      const label=(app.textContent||'').trim().toLowerCase();
      if(label.includes('contactos')){
        event.preventDefault();
        window.location.href='/contactos';
        return;
      }
      if(label.includes('notas')){
        event.preventDefault();
        window.location.href='/notas';
      }
    };
    document.addEventListener('click',handler);
    return()=>document.removeEventListener('click',handler);
  },[]);
  return null;
}
