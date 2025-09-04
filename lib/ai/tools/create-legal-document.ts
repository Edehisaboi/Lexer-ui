import { generateUUID } from '@/lib/utils';
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import { WebSocketApiService } from '@/lib/agent/websocketAPI';
import type { ChatMessage } from '@/lib/types';

interface CreateLegalDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  chatId: string;
}

export const createLegalDocument = ({
  session,
  dataStream,
  chatId,
}: CreateLegalDocumentProps) =>
  tool({
    description: '',
    inputSchema: z.object({
      isNewDocument: z.boolean().describe('Whether to create a new document'),
      message: z.string().describe(''),
    }),
    execute: async ({ isNewDocument, message }) => {
      const id = generateUUID();
      const documentService = new WebSocketApiService();

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

      await documentService.generateDocument(chatId, isNewDocument, message, {
        onChunk: (chunk) => {
          dataStream.write({
            type: 'data-textDelta',
            data: chunk,
            transient: true,
          });
        },
        onStreamingEnd: () => {
          documentService.disconnect;
        },
      });

      return {
        id,
        kind: 'tiptap',
        content: 'A legal document was created and is now visible to the user.',
      };
    },
  });
