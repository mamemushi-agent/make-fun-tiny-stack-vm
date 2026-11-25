import{mkdirSync as M,readFileSync as F,readdirSync as D,writeFileSync as W}from'node:fs';
import{join as J}from'node:path';
const A=process.env.MAKEFUN_INPUT_DIR??'/input',B=process.env.MAKEFUN_OUTPUT_DIR??'/output';
function R(p,n){
const L=p.length,s=new Int32Array(256),c=new Int32Array(64),m=new Int32Array(256),o=new Uint8Array(65536);
let S=0,C=0,O=0,I=0,P=0,T=0,e=0,a,b,r,t,u;
try{
for(;;){
if(T>=1e6)throw 10;
if(P<0||P>=L)throw 9;
const op=p[P],im=op==1?1:op==2?4:op>47&&op<52?2:0;
if(P+im>=L)throw 9;
T++;
const N=P+1+im,v=p[N-2]|p[N-1]<<8,w=v>32767?v-65536:v;
P=N;
switch(op){
case 0:throw 0;
case 1:if(S>255)throw 3;t=p[N-1];s[S++]=t>127?t-256:t;break;
case 2:if(S>255)throw 3;s[S++]=p[N-4]|p[N-3]<<8|p[N-2]<<16|p[N-1]<<24;break;
case 3:if(S<1)throw 2;S--;break;
case 4:if(S<1)throw 2;if(S>255)throw 3;s[S]=s[S-1];S++;break;
case 5:if(S<2)throw 2;t=s[S-1];s[S-1]=s[S-2];s[S-2]=t;break;
case 6:if(S<2)throw 2;if(S>255)throw 3;s[S]=s[S-2];S++;break;
case 7:if(S<3)throw 2;t=s[S-3];s[S-3]=s[S-2];s[S-2]=s[S-1];s[S-1]=t;break;
case 16:case 17:case 18:case 19:case 20:case 21:case 22:case 24:case 25:case 26:case 28:case 29:case 30:case 32:case 33:case 34:
if(S<2)throw 2;b=s[--S];a=s[S-1];
switch(op){
case 16:r=a+b;break;
case 17:r=a-b;break;
case 18:r=Math.imul(a,b);break;
case 19:if(!b)throw 4;r=Math.trunc(a/b);break;
case 20:if(!b)throw 4;r=a%b;break;
case 21:if(!b)throw 4;r=Math.trunc((a>>>0)/(b>>>0));break;
case 22:if(!b)throw 4;r=(a>>>0)%(b>>>0);break;
case 24:r=a&b;break;
case 25:r=a|b;break;
case 26:r=a^b;break;
case 28:r=a<<(b&31);break;
case 29:r=a>>(b&31);break;
case 30:r=a>>>(b&31);break;
case 32:r=a==b?1:0;break;
case 33:r=a<b?1:0;break;
default:r=(a>>>0)<(b>>>0)?1:0;
}
s[S-1]=r|0;break;
case 23:if(S<1)throw 2;s[S-1]=-s[S-1];break;
case 27:if(S<1)throw 2;s[S-1]=~s[S-1];break;
case 48:P=N+w;break;
case 49:if(S<1)throw 2;if(s[--S]==0)P=N+w;break;
case 50:if(S<1)throw 2;if(s[--S]!=0)P=N+w;break;
case 51:if(C>63)throw 7;c[C++]=N;P=v;break;
case 52:if(C<1)throw 8;P=c[--C];break;
case 64:if(S<1)throw 2;t=s[S-1];if(t<0||t>255)throw 6;s[S-1]=m[t];break;
case 65:if(S<2)throw 2;t=s[S-1];if(t<0||t>255)throw 6;m[t]=s[S-2];S-=2;break;
case 80:if(S<1)throw 2;u=''+s[S-1];if(O+u.length>65536)throw 11;S--;for(t=0;t<u.length;t++)o[O++]=u.charCodeAt(t);break;
case 81:if(S<1)throw 2;if(O>65535)throw 11;o[O++]=s[--S]&255;break;
case 82:if(S>255)throw 3;s[S++]=I<n.length?n[I++]:-1;break;
case 83:if(S<1)throw 2;throw s[--S]&255;
default:throw 5;
}
}
}catch(x){e=x}
return[Buffer.from(o.subarray(0,O)),e];
}
for(const id of D(A).sort()){
const p=F(J(A,id,'program.bin'));
let n;try{n=F(J(A,id,'input.bin'))}catch{n=Buffer.alloc(0)}
const[x,e]=R(p,n);
M(J(B,id),{recursive:true});
W(J(B,id,'stdout.bin'),x);
W(J(B,id,'exit.txt'),e+'\n');
}
