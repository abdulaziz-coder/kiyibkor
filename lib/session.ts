export function sessionKey(){
 const existing=localStorage.getItem('kiyib-kor-session');
 if(existing&&/^[a-f0-9]{64}$/.test(existing))return existing;
 const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 localStorage.setItem('kiyib-kor-session',key);return key;
}
