import { storageKey } from './storage';
import type { DmScreenCommitNotifier } from './dm-screen-repository';

export const DM_SCREEN_CHANNEL_NAME = 'encounterizer-dm-screen-v2';
export const DM_SCREEN_SIGNAL_STORAGE_KEY = storageKey('dmScreenSignal');

interface DmScreenCommitMessage {
  type: 'dm-screen-committed';
  protocolVersion: 1;
  sourceId: string;
  revision: number;
  nonce: string;
}

type BroadcastChannelConstructor = new (name: string) => BroadcastChannel;

function isCommitMessage(value: unknown): value is DmScreenCommitMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Partial<DmScreenCommitMessage>;
  return message.type === 'dm-screen-committed'
    && message.protocolVersion === 1
    && typeof message.sourceId === 'string'
    && Number.isSafeInteger(message.revision)
    && (message.revision ?? -1) >= 0
    && typeof message.nonce === 'string';
}

function createSourceId(browserWindow: Window): string {
  return browserWindow.crypto?.randomUUID?.()
    ?? `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Broadcast revisions only; receivers always reload the document from IDB. */
export class BrowserDmScreenCommitNotifier implements DmScreenCommitNotifier {
  private readonly listeners = new Set<(revision: number) => void>();
  private readonly sourceId: string;
  private channel: BroadcastChannel | null = null;
  private started = false;

  constructor(
    private readonly browserWindow: Window,
    sourceId?: string,
  ) {
    this.sourceId = sourceId ?? createSourceId(browserWindow);
  }

  private notify(value: unknown): void {
    if (!isCommitMessage(value) || value.sourceId === this.sourceId) return;
    for (const listener of this.listeners) listener(value.revision);
  }

  private readonly onStorage = (event: StorageEvent) => {
    if (event.key !== DM_SCREEN_SIGNAL_STORAGE_KEY || !event.newValue) return;
    try {
      this.notify(JSON.parse(event.newValue) as unknown);
    } catch {
      // Malformed signals never contain the DM Screen document itself.
    }
  };

  private readonly onVisibilityChange = () => {
    if (this.browserWindow.document.visibilityState !== 'visible') return;
    for (const listener of this.listeners) listener(Number.MAX_SAFE_INTEGER);
  };

  private start(): void {
    if (this.started) return;
    this.started = true;
    const Channel = (this.browserWindow as Window & {
      BroadcastChannel?: BroadcastChannelConstructor;
    }).BroadcastChannel;
    if (typeof Channel === 'function') {
      try {
        const channel = new Channel(DM_SCREEN_CHANNEL_NAME);
        channel.onmessage = (event: MessageEvent<unknown>) => this.notify(event.data);
        this.channel = channel;
      } catch {
        this.channel = null;
      }
    }
    if (!this.channel) {
      this.browserWindow.addEventListener('storage', this.onStorage);
    }
    this.browserWindow.document.addEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
  }

  private stop(): void {
    if (!this.started) return;
    this.started = false;
    this.channel?.close();
    this.channel = null;
    this.browserWindow.removeEventListener('storage', this.onStorage);
    this.browserWindow.document.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
  }

  subscribe(listener: (revision: number) => void): () => void {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  publish(revision: number): void {
    const message: DmScreenCommitMessage = {
      type: 'dm-screen-committed',
      protocolVersion: 1,
      sourceId: this.sourceId,
      revision,
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch {
        // Visibility refresh remains a healing path for a missed signal.
      }
      return;
    }
    try {
      this.browserWindow.localStorage.setItem(
        DM_SCREEN_SIGNAL_STORAGE_KEY,
        JSON.stringify(message),
      );
    } catch {
      // The document commit already succeeded; do not misreport it as failed.
    }
  }

  close(): void {
    this.listeners.clear();
    this.stop();
  }
}
