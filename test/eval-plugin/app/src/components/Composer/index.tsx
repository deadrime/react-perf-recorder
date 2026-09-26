import { memo, type ReactNode } from 'react';
import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
import { presenceStore, useChatStore } from '../../store/chat';
import { useFieldError } from './useFieldError';

export interface ComposerValues {
  text: string;
  replyTo: string;
  remindIn: string;
}

type FormControl = Control<ComposerValues>;

export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
  return (
    <label className="field grow">
      <input
        {...field}
        data-testid="message"
        placeholder="Write a message"
        onChange={(e) => {
          field.onChange(e);
          // The other fields are validated against the text.
          void trigger();
        }}
        onKeyDown={(e) => {
          // Enter waits while someone is typing a reply, so the two messages do not cross.
          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
        }}
      />
    </label>
  );
};

function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
  const { field } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
  return { field, error: useFieldError(control, name).message };
}

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
      <StatRow title={limitTitle} value="4000" />
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
  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
    mode: 'onChange',
    defaultValues: { text: '', replyTo: '', remindIn: '' },
  });
  return (
    <form
      className="composer"
      data-testid="composer"
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
