import {useEffect,useRef,useState} from 'react';
type Turn={job_id:string;message:string;reply:string|null;state:string;created_at?:string};
const pending=(turn:Turn)=>['accepted','running'].includes(turn.state);
export function StudioChat({documentId,title,userId,csrf,busy,onCompleted,onPreference}:{documentId:string;title:string;userId:string;csrf:string;busy:boolean;onCompleted:()=>Promise<void>;onPreference:(turn:Turn)=>Promise<void>}){
 const [turns,setTurns]=useState<Turn[]>([]),[text,setText]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const identity=JSON.stringify([userId,documentId]);
 const storageKey=`prism-chat:${identity}`;
 const active=useRef(identity);active.current=identity;
 const completed=useRef(new Set<string>());
 const uncertain=useRef<{key:string;message:string}|null>(null);
 useEffect(()=>{
  let disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
  setTurns([]);setText('');setError('');setNotice('');setSending(false);uncertain.current=null;
  try{const saved=sessionStorage.getItem(storageKey);if(saved){uncertain.current=JSON.parse(saved);setText(uncertain.current?.message??'');}}catch{setError('Gespeicherte Nachricht konnte nicht geladen werden.');}
  const load=async()=>{
   try{
    const r=await fetch(`/v1/documents/${encodeURIComponent(documentId)}/chat`);const value=await r.json();
    if(!r.ok)throw new Error(value.error??'Chat konnte nicht geladen werden.');
    if(disposed)return;
    const items=value.items as Turn[];
    // A GET begun before POST acknowledgement must not erase the accepted turn.
    setTurns(previous=>[...items,...previous.filter(turn=>pending(turn)&&!items.some(item=>item.job_id===turn.job_id))]);
    for(const turn of items)if(turn.state==='completed'&&!completed.current.has(turn.job_id)){await onCompleted();completed.current.add(turn.job_id);}
    timer=setTimeout(()=>void load(),items.some(pending)?2000:5000);
   }catch(e){if(!disposed){setError(String(e));timer=setTimeout(()=>void load(),5000);}}
  };void load();
  return()=>{disposed=true;if(timer)clearTimeout(timer);};
 },[identity]);
 const send=async()=>{
  if(busy||sending||turns.some(pending)||(!text.trim()&&!uncertain.current))return;
  const turn=uncertain.current??{key:crypto.randomUUID(),message:text.trim()};
  uncertain.current=turn;sessionStorage.setItem(storageKey,JSON.stringify(turn));setSending(true);setError('');
  const sentIdentity=identity;
  try{
   const r=await fetch(`/v1/documents/${encodeURIComponent(documentId)}/chat`,{method:'POST',headers:{'content-type':'application/json','x-prism-csrf':csrf,'idempotency-key':turn.key},body:JSON.stringify({message:turn.message})});const body=await r.json();
   if(!r.ok)throw new Error(body.error??'Nachricht konnte noch nicht bestätigt werden.');
   sessionStorage.removeItem(storageKey);
   if(active.current!==sentIdentity)return;
   uncertain.current=null;setText('');setTurns(items=>items.some(item=>item.job_id===body.jobId)?items:[...items,{job_id:body.jobId,message:turn.message,reply:null,state:'accepted'}]);
  }catch(e){if(active.current===sentIdentity)setError(`${String(e)} Dein Text bleibt gespeichert. Erneut senden verwendet dieselbe Nachrichten-ID.`);}
  finally{if(active.current===sentIdentity)setSending(false);}
 };
 return <section className="studio-chat" aria-label={`Chat zu ${title}`}>
  <p className="quiet">Chat zu: {title} · ursprüngliche Design-Session</p>
  <p className="quiet">Hier besprechen und ändern wir diesen Entwurf. Vorlieben werden nur über eine ausdrückliche Aktion gespeichert.</p>
  <div className="chat-history" role="log" aria-label="Chatverlauf" aria-live="polite">
   {!turns.length&&<p>Was möchtest du mit Prism besprechen?</p>}
   {turns.map(turn=><article key={turn.job_id}>
    <p><strong>Du</strong><br/>{turn.message}</p>
    {turn.reply?<p><strong>Prism</strong><br/>{turn.reply}</p>:<p role="status">{turn.state==='accepted'?'Nachricht wartet auf Prism…':turn.state==='running'?'Prism antwortet…':turn.state==='needs_nova'?'Die Antwort ist noch ungeklärt. Die Nachricht wird nicht erneut gestartet.':turn.state==='superseded'?'Der Entwurf wurde inzwischen geändert. Bitte sende eine neue Nachricht zum aktuellen Stand.':'Antwort wird geladen…'}</p>}
    <button disabled={!turn.created_at} onClick={()=>void onPreference(turn).then(()=>setNotice('Als Vorliebe für dieses Projekt gespeichert.')).catch(e=>setError(String(e)))}>Als Vorliebe speichern</button>
   </article>)}
  </div>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <label>Nachricht an Prism<textarea aria-label="Nachricht an Prism" maxLength={12000} value={text} disabled={busy||sending||Boolean(uncertain.current)} onChange={event=>setText(event.target.value)} placeholder="Frage stellen oder eine Änderung beschreiben…"/></label>
  <button className="primary" disabled={busy||sending||turns.some(pending)||(!text.trim()&&!uncertain.current)} onClick={()=>void send()}>{sending?'Wird gesendet…':uncertain.current?'Dieselbe Nachricht erneut senden':'Nachricht senden'}</button>
 </section>;
}
