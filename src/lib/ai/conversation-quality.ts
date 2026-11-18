const topics = [
  /上门|响应时效|响应速度|几小时|多久.*到|多久.*响应/,
  /域名|服务器|主机费/,
  /原型|效果图|设计样稿/,
  /报价|价格|费用|收费|预算/,
  /终身|长期维护|维护范围|年费/,
];

function questionTopics(line: string) {
  return (line.match(/[^。！？!?]+[？?]/gu) ?? [])
    .flatMap(question => topics.flatMap((topic, index) => topic.test(question) ? [index] : []));
}

export function repeatsCustomerQuestion(reply: string, previous: string[]) {
  if (previous.some(line => line.trim() === reply.trim())) return true;
  const recent = previous.slice(-3).map(questionTopics);
  return questionTopics(reply).some(topic => recent.filter(asked => asked.includes(topic)).length >= 2);
}
