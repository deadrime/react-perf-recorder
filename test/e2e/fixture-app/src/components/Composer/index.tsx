import { memo, type ReactNode } from 'react';
import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
import { useStore } from 'zustand';
import { bug } from '../../bugs';
import { presenceStore, useChatStore } from '../../store/chat';
import { useFieldError } from './useFieldError';

export interface ComposerValues {
  text: string;
  replyTo: string;
  remindIn: string;
}

type FormControl = Control<ComposerValues>;

function useLivePresence() {
  return useStore(presenceStore, (s) => s.typing);
}

function usePresenceAtRender() {
  return presenceStore.getState().typing;
}

/** The hint needs who is typing while the box renders, not a render on every presence event. */
const useTypingNow = bug('live-subscription') ? useLivePresence : usePresenceAtRender;

export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
  const typing = useTypingNow();
  return (
    <label className="field grow">
      <input
        {...field}
        data-testid="message"
        placeholder="Write a message"
        onChange={(e) => {
          field.onChange(e);
          // The other fields are validated against the text, as in a real form.
          void trigger();
        }}
      />
      <small className="hint">{typing ? `${typing} is typing…` : ' '}</small>
    </label>
  );
};

function useMetaWithFieldState(control: FormControl, name: 'replyTo' | 'remindIn') {
  const { field, fieldState } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
  return { field, error: fieldState.error?.message };
}

function useMeta(control: FormControl, name: 'replyTo' | 'remindIn') {
  const { field } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
  return { field, error: useFieldError(control, name).message };
}

const useMetaField = bug('field-state') ? useMetaWithFieldState : useMeta;

const LABELS = { replyTo: 'reply to #', remindIn: 'remind in, min' } as const;

export const MetaInput = ({ control, name }: { control: FormControl; name: 'replyTo' | 'remindIn' }) => {
  const { field, error } = useMetaField(control, name);
  return (
    <label className="field small">
      <span>{LABELS[name]}</span>
      <input {...field} data-testid={name} placeholder="0" />
      {error && <em className="error">{error}</em>}
    </label>
  );
};

export const StatRow = memo(({ title, value }: { title: ReactNode; value: string }) => (
  <span className="stat" data-testid="stat-row">
    {title} <b>{value}</b>
  </span>
));

const LimitTitle = () => <span>limit</span>;
const limitTitle = <LimitTitle />;

export const ComposerHints = ({ control }: { control: FormControl }) => {
  const text = useWatch({ control, name: 'text' });
  return (
    <div className="hints" data-testid="hints">
      <StatRow title={bug('inline-jsx-prop') ? <LimitTitle /> : limitTitle} value="4000" />
      <StatRow title="typed" value={String(text?.length ?? 0)} />
    </div>
  );
};

const SendButton = ({ control }: { control: FormControl }) => {
  const { isValid } = useFormState({ control });
  return (
    <button type="submit" data-testid="send" disabled={!isValid}>
      Send
    </button>
  );
};

export const Composer = () => {
  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({
    mode: 'onChange',
    defaultValues: { text: '', replyTo: '', remindIn: '' },
  });
  // watch() in render subscribes the form root to every field.
  const filled = bug('form-watch') ? Object.values(watch()).filter(Boolean).length : null;
  return (
    <form
      className="composer"
      data-testid="composer"
      data-filled={filled ?? undefined}
      onSubmit={handleSubmit((values) => {
        useChatStore.getState().send(values.text);
        reset();
      })}
    >
      <div className="row">
        <MessageInput control={control} trigger={() => trigger()} />
        <SendButton control={control} />
      </div>
      <div className="row meta">
        <MetaInput control={control} name="replyTo" />
        <MetaInput control={control} name="remindIn" />
        <ComposerHints control={control} />
      </div>
    </form>
  );
};
