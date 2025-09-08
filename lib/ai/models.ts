export const DEFAULT_CHAT_MODEL: string = 'main-model';

export interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'main-model',
    name: 'Main model',
    description: 'Primary model for all-purpose chat and reasoning',
  },
  {
    id: 'questioning-model',
    name: 'Questioning model',
    description: 'Uses advanced reasoning for questioning the user',
  },
];
