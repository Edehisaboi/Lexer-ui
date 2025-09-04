import { Artifact } from '@/components/create-artifact';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import { CopyIcon, MessageIcon, PenIcon, RedoIcon, UndoIcon } from '@/components/icons';
import { toast } from 'sonner';

export const tiptapArtifact = new Artifact<'tiptap'>({
  kind: 'tiptap',
  description: 'Rich text editing using TipTap (HTML-backed).',
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === 'data-textDelta') {
      setArtifact((draft) => ({
        ...draft,
        content: draft.content + streamPart.data,
        isVisible:
        draft.status === 'streaming' &&
            draft.content.length > 1,
        status: 'streaming',
      }));
    }
  },
  content: ({ content, status, onSaveContent }) => {
    // Wrap SimpleEditor: it controls a rich editor; we feed HTML and save HTML back
    return (
      <div className="px-1 h-full items-center">
        <div className="relative h-full w-full max-w-full">
          <SimpleEditor
            content={content}
            editable={status === 'idle'}
            onChangeHtml={(html) => onSaveContent(html, true)}
          />
        </div>
      </div>
    );
  },
  actions: [
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: ({ handleVersionChange }) => handleVersionChange('prev'),
      isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: ({ handleVersionChange }) => handleVersionChange('next'),
      isDisabled: ({ isCurrentVersion }) => !!isCurrentVersion,
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy HTML to clipboard',
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success('Copied to clipboard!');
      },
    },
  ],
  toolbar: [
    // todo: this is were document suggestions should be handled
    {
      icon: <PenIcon />,
      description: 'Add final polish',
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.',
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: 'Request suggestions',
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Please add suggestions you have that could improve the writing.',
            },
          ],
        });
      },
    },
  ],
});
