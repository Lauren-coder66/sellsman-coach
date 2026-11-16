import type {Scenario} from './ai/provider';
export const templates: {title:string;scenario:Scenario}[] = [
  {title:'企业网站开发',scenario:{product:'企业网站开发服务',description:'为企业设计并开发展示业务信息的网站。',identity:'中小企业负责人',personality:'普通型',difficulty:'中等',goal:'了解客户需求'}},
  {title:'AI 软件',scenario:{product:'AI 办公软件',description:'帮助团队整理文档和日常工作流程的软件。',identity:'运营主管',personality:'怀疑型',difficulty:'中等',goal:'介绍产品价值'}},
  {title:'设计服务',scenario:{product:'品牌设计服务',description:'提供品牌视觉设计和交付文件。',identity:'创业者',personality:'价格敏感型',difficulty:'中等',goal:'处理客户异议'}},
  {title:'房源介绍',scenario:{product:'房源介绍服务',description:'根据客户需求介绍可选房源并安排看房。',identity:'购房客户',personality:'强势型',difficulty:'困难',goal:'争取下一次沟通'}},
  {title:'价格异议',scenario:{product:'业务咨询服务',description:'帮助客户梳理业务流程并提出改进建议。',identity:'采购负责人',personality:'价格敏感型',difficulty:'困难',goal:'处理客户异议'}},
  {title:'陌生客户初访',scenario:{product:'产品介绍',description:'向潜在客户介绍产品用途并了解需求。',identity:'潜在客户',personality:'冷淡型',difficulty:'简单',goal:'了解客户需求'}},
];
