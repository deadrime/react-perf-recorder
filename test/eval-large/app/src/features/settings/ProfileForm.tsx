import { useEffect, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { ApiError } from '../../api/client';
import type { Profile } from '../../api/types';
import { Spinner } from '../../components/ui/Misc';
import { useProfile, useSaveProfile } from '../../queries/settings';
import { SaveBar, SelectField, TextArea, TextField } from './fields';

const TIMEZONES = [
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Mexico_City',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
];
const BIO_MAX = 280;

function BioCounter() {
  const bio = useWatch<Profile, 'bio'>({ name: 'bio' });
  return <span className={bio.length > BIO_MAX ? 'danger' : undefined}>{BIO_MAX - bio.length} characters left</span>;
}

function Form({ profile }: { profile: Profile }) {
  const methods = useForm<Profile>({ defaultValues: profile, mode: 'onBlur' });
  const save = useSaveProfile();
  const [saved, setSaved] = useState(false);

  useEffect(() => methods.reset(profile), [profile, methods]);

  const submit = methods.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      setSaved(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) methods.setError('handle', { message: error.message });
      else throw error;
    }
  });

  return (
    <FormProvider {...methods}>
      <form className="settings-form" onSubmit={submit} data-testid="profile-form">
        <div className="form-grid">
          <TextField<Profile> name="name" label="Full name" rules={{ required: 'Tell your team who you are' }} />
          <TextField<Profile>
            name="handle"
            label="Handle"
            prefix="@"
            hint="Used for mentions. Lower-case letters, digits and underscores."
            rules={{ required: 'A handle is required', pattern: { value: /^[a-z0-9_]{2,20}$/, message: '2–20 lower-case letters, digits or _' } }}
          />
          <TextField<Profile> name="title" label="Title" placeholder="What you do" />
          <SelectField<Profile> name="timezone" label="Time zone" options={TIMEZONES.map((z) => ({ value: z, label: z.replace('_', ' ') }))} />
          <SelectField<Profile>
            name="weekStartsOn"
            label="Week starts on"
            options={[
              { value: 'monday', label: 'Monday' },
              { value: 'sunday', label: 'Sunday' },
            ]}
          />
        </div>
        <TextArea<Profile>
          name="bio"
          label="About you"
          rows={4}
          hint={<BioCounter />}
          rules={{ maxLength: { value: BIO_MAX, message: `At most ${BIO_MAX} characters` } }}
        />
        <SaveBar onReset={() => methods.reset(profile)} saved={saved} />
      </form>
    </FormProvider>
  );
}

export function ProfileForm() {
  const { data } = useProfile();
  return data ? <Form profile={data} /> : <Spinner label="Loading profile" />;
}
