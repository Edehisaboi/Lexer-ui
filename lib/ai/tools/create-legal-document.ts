import { generateUUID, agentUpdatesMessage } from '@/lib/utils';
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import { WebSocketApiService } from '@/lib/agent/web-socket-api';
import {
  saveDocument,
  updateChatMissingInfoById,
  deleteChatMissingInfoById,
  updateChatModelById,
} from '@/lib/db/queries';
import type { ChatMessage } from '@/lib/types';

interface CreateLegalDocumentProps {
  session: Session;
  currentModel: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  chatId: string;
}

export const createLegalDocument = ({
  session,
  currentModel,
  dataStream,
  chatId,
}: CreateLegalDocumentProps) =>
  tool({
    description:
      'Create a legal document for a legal advice, contract or other legal writing.',
    inputSchema: z.object({
      message: z
        .string()
        .describe('The entire user message, for requesting a legal document'),
    }),
    execute: async ({ message }) => {
      const id = generateUUID();
      const documentService = new WebSocketApiService();
      let interruptContent: string | null = null;

      dataStream.write({
        type: 'data-kind',
        data: 'tiptap',
        transient: true,
      });

      dataStream.write({
        type: 'data-id',
        data: id,
        transient: true,
      });

      dataStream.write({
        type: 'data-title',
        data: 'Legal Document', // TODO: Add title, it should be in the ws callbacks
        transient: true,
      });

      dataStream.write({
        type: 'data-clear',
        data: null,
        transient: true,
      });

      // Start a reasoning stream
      dataStream.write({
        type: 'reasoning-start',
        id: id,
      });

      const isNewDocument = currentModel === 'main-model';

      await documentService.generateDocument(chatId, isNewDocument, message, {
        onChunk: (chunk) => {
          dataStream.write({
            type: 'data-textDelta',
            data: chunk,
            transient: true,
          });
        },
        onInterrupt: async (payload) => {
          interruptContent = payload;
          await updateChatMissingInfoById({
            chatId,
            missingInfo: payload,
          });
          await updateChatModelById({
            chatId,
            model: 'questioning-model',
          });
        },
        onUpdate: (node) => {
          const thinkingMessage =
            agentUpdatesMessage[node] ?? 'Working on your document...';

          // Stream the thinking message to the UI
          dataStream.write({
            type: 'reasoning-delta',
            id: id,
            delta: `${thinkingMessage}\n\n`,
          });
        },
        onDraftContent: async (draftContent) => {
          if (!session.user.id) return;
          await saveDocument({
            id: id,
            title: 'Legal Document',
            content: draftContent,
            kind: 'tiptap',
            userId: session.user.id,
          });
          await deleteChatMissingInfoById({
            chatId,
          });
          await updateChatModelById({
            chatId,
            model: 'main-model',
          });
        },
        onStreamingEnd: () => {
          dataStream.write({
            type: 'reasoning-end',
            id: id,
          });

          dataStream.write({
            type: 'data-finish',
            data: null,
            transient: true,
          });
        },
      });

      return {
        id,
        title: 'Legal Document',
        kind: 'tiptap',
        content:
          interruptContent ||
          'Success! The legal document was created and is now visible to the user.',
      };
    },
  });
