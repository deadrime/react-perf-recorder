import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import type { NotificationKind, NotificationSettings } from '../../api/types';
import { Spinner } from '../../components/ui/Misc';
import { useNotificationSettings, useSaveNotificationSettings } from '../../queries/settings';
import { SaveBar } from './fields';

const KINDS: Array<{ kind: NotificationKind; label: string }> = [
  { kind: 'assigned', label: 'An issue is assigned to me' },
  { kind: 'mentioned', label: 'Someone mentions me' },
  { kind: 'commented', label: 'Someone comments on my issue' },
  { kind: 'status_changed', label: 'The status of my issue changes' },
  { kind: 'due_soon', label: 'An issue of mine is due soon' },
];

function QuietHours() {
  const enabled = useWatch<NotificationSettings, 'quietHours.enabled'>({ name: 'quietHours.enabled' });
  return (
    <fieldset className="stack">
      <label className="row gap-sm">
        <FormCheckbox name="quietHours.enabled" /> Pause push notifications at night
      </label>
      {enabled && (
        <div className="row gap">
          <FormTime name="quietHours.from" /> to <FormTime name="quietHours.to" />
        </div>
      )}
    </fieldset>
  );
}

function FormCheckbox({ name }: { name: `email.${NotificationKind}` | `push.${NotificationKind}` | 'quietHours.enabled' }) {
  const { register } = useFormContext<NotificationSettings>();
  return <input type="checkbox" {...register(name)} />;
}

function FormTime({ name }: { name: 'quietHours.from' | 'quietHours.to' }) {
  const { register } = useFormContext<NotificationSettings>();
  return <input type="time" className="input input-sm" {...register(name)} />;
}

function Form({ settings }: { settings: NotificationSettings }) {
  const methods = useForm<NotificationSettings>({ defaultValues: settings });
  const save = useSaveNotificationSettings();
  return (
    <FormProvider {...methods}>
      <form
        className="settings-form"
        onSubmit={methods.handleSubmit((values) => save.mutateAsync(values).then(() => methods.reset(values)))}
        data-testid="notification-form"
      >
        <table className="grid matrix">
          <thead>
            <tr>
              <th />
              <th>Email</th>
              <th>Push</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map(({ kind, label }) => (
              <tr key={kind}>
                <td>{label}</td>
                <td>
                  <FormCheckbox name={`email.${kind}`} />
                </td>
                <td>
                  <FormCheckbox name={`push.${kind}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="field">
          <span className="field-label">Email digest</span>
          <select className="input" {...methods.register('digest')}>
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <QuietHours />
        <SaveBar onReset={() => methods.reset(settings)} saved={save.isSuccess} />
      </form>
    </FormProvider>
  );
}

export function NotificationSettingsForm() {
  const { data } = useNotificationSettings();
  return data ? <Form settings={data} /> : <Spinner label="Loading settings" />;
}
