import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useArtifact } from '@/hooks/use-artifact';
import type { UIArtifact } from '@/components/artifact';
import { generateUUID } from '@/lib/utils';

export type OpenTiptapOptions = {
  title: string;
  documentId?: string;
  boundingBox?: UIArtifact['boundingBox'];
  replace?: boolean; // default true
};

export function useTiptapArtifactStream() {
  const { artifact, setArtifact } = useArtifact();

  const docIdRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);

  const open = useCallback(
    (opts: OpenTiptapOptions) => {
      const id = opts.documentId ?? generateUUID();
      docIdRef.current = id;
      isStreamingRef.current = true;

      setArtifact((prev) => ({
        ...prev,
        documentId: id,
        title: opts.title,
        kind: 'tiptap',
        isVisible: true,
        status: 'streaming',
        content: opts.replace === false ? prev.content : '',
        boundingBox: opts.boundingBox ?? prev.boundingBox,
      }));
    },
    [setArtifact],
  );

  const close = useCallback(() => {
    setArtifact((draft) => ({ ...draft, isVisible: false }));
  }, [setArtifact]);

  const append = useCallback((chunk: string) => {
    if (!isStreamingRef.current) return;
    setArtifact((draft) => ({
      ...draft,
      content: draft.content + chunk,
      status: 'streaming',
      isVisible: true,
      kind: 'tiptap',
    }));
  }, []);

  const complete = useCallback(
    (opts?: { setIdle?: boolean }) => {
      isStreamingRef.current = false;
      if (opts?.setIdle !== false) {
        setArtifact((draft) => ({ ...draft, status: 'idle' }));
      }
    },
    [setArtifact],
  );

  const error = useCallback(
    (err: unknown) => {
      // Optionally log/report error. We just finalize streaming state.
      void complete();
    },
    [complete],
  );

  useEffect(() => {
    return () => {
      isStreamingRef.current = false;
    };
  }, []);

  return useMemo(
    () => ({
      open,
      close,
      append,
      complete,
      error,
      isOpen: artifact.isVisible && artifact.kind === 'tiptap',
      isStreaming: isStreamingRef.current,
      documentId: docIdRef.current,
      setTitle: (title: string) =>
        setArtifact((draft) => ({ ...draft, title })),
    }),
    [artifact.isVisible, open, close, append, complete, error, setArtifact],
  );
}
