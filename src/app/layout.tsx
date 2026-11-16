import type {Metadata} from 'next'; import './globals.css';
export const metadata:Metadata={title:'Sales Practice｜销售陪练',description:'和 AI 客户对练，复盘每一次沟通'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
