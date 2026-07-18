export const SITE = {
  title: 'Gradient Notes',
  shortTitle: '∇ notes',
  author: 'Tian',
  description: 'Notes on mathematics, language models, reinforcement learning, and the ideas connecting them.',
} as const;

export const TOPICS = {
  math: {
    label: 'Math',
    description: 'Probability, optimization, and useful bits of analysis.',
  },
  'llm-architecture': {
    label: 'LLM architecture',
    description: 'Transformers, inference systems, and scaling behavior.',
  },
  'reinforcement-learning': {
    label: 'Reinforcement learning',
    description: 'Control, credit assignment, and learning from feedback.',
  },
} as const;

export function topicLabel(topic: string) {
  if (topic in TOPICS) return TOPICS[topic as keyof typeof TOPICS].label;

  return topic
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

