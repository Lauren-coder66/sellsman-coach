export async function api<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{...init,headers:{'Content-Type':'application/json',...init?.headers}});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error?.message||'请求失败');
  return result.data as T;
}
