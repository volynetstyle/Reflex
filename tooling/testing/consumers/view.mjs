import { jsx } from "@volynets/reflex-dom/jsx-runtime";
export function counterView(count,onClick){
 return jsx("button",{class:()=>count()===0?"idle":"active",type:"button",onClick,children:["count: ",count]});
}
