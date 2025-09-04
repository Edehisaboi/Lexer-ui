import { smoothStream, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { updateDocumentPrompt } from '@/lib/ai/prompts';

export const tiptapDocumentHandler = createDocumentHandler<'tiptap'>({
  kind: 'tiptap',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system:
        'Generate semantic HTML only (no <html>, <head>, or external assets). Use headings (h1-h3), paragraphs, lists, code blocks when relevant, and simple inline formatting. Ensure valid, well-formed HTML.',
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: title,
    });

    for await (const delta of fullStream) {
      const { type } = delta as any;
      if (type === 'text-delta') {
        const { text } = delta as any;
        draftContent += text;
        dataStream.write({
          type: 'data-textDelta',
          data: text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: updateDocumentPrompt(document.content, 'tiptap'),
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: description,
      providerOptions: {
        openai: { prediction: { type: 'content', content: document.content } },
      },
    });

    for await (const delta of fullStream) {
      const { type } = delta as any;
      if (type === 'text-delta') {
        const { text } = delta as any;
        draftContent += text;
        dataStream.write({
          type: 'data-textDelta',
          data: text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
