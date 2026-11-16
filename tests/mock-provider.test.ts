import {describe,it,expect} from 'vitest';
import {mockProvider} from '../src/lib/ai/mock-provider';
import type {Scenario,ConversationMessage} from '../src/lib/ai/provider';
const scenario:Scenario={product:'设计服务',description:'提供品牌设计',identity:'创业者',personality:'价格敏感型',difficulty:'中等',goal:'处理客户异议'};
describe('mock provider',()=>{
  it('responds to personality and price context',async()=>{const profile=await mockProvider.generateCustomerProfile(scenario);const opening=await mockProvider.generateCustomerOpening(scenario,profile);expect(opening).toContain('费用');const answer=await mockProvider.generateCustomerReply(scenario,profile,[{id:'1',role:'user',content:'价格是多少？',sequence:1}]);expect(answer).toContain('预算')});
  it('quotes an actual user message and keeps scores in range',async()=>{const messages:ConversationMessage[]=[{id:'real-message',role:'user',content:'您目前有哪些问题？',sequence:1}];const report=await mockProvider.generateTrainingReport(scenario,messages);expect(report.issues[0].message_id).toBe('real-message');expect(messages[0].content).toContain(report.issues[0].quote);expect(Object.values(report.scores).every(x=>x.score>=0&&x.score<=5)).toBe(true)})
});
