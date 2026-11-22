import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button, Heading, HelperMessage, Label, SectionMessage, Spinner, Stack, Text, Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke('getBootstrap').then((res) => {
      if (!res.ok) return setMessage({ appearance: 'error', text: res.error });
      const s = res.data.settings;
      setForm({
        projectKeys: s.projectKeys.join(', '),
        defaultHourlyRate: String(s.defaultHourlyRate),
        usefulLifeMonths: String(s.usefulLifeMonths),
        currency: s.currency,
      });
    });
  }, []);

  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  const save = async () => {
    setSaving(true);
    const res = await invoke('saveSettings', form);
    setSaving(false);
    setMessage(res.ok ? { appearance: 'success', text: 'Settings saved.' } : { appearance: 'error', text: res.error });
  };

  if (!form) return message ? <SectionMessage appearance="error"><Text>{message.text}</Text></SectionMessage> : <Spinner label="Loading" />;

  return (
    <Stack space="space.200">
      <Heading as="h1">Sopher settings</Heading>
      {message && <SectionMessage appearance={message.appearance}><Text>{message.text}</Text></SectionMessage>}

      <Label labelFor="projects">Projects</Label>
      <Textfield id="projects" {...field('projectKeys')} />
      <HelperMessage>Jira project keys to track, separated by commas, e.g. PAY, CORE</HelperMessage>

      <Label labelFor="rate">Default loaded hourly rate</Label>
      <Textfield id="rate" type="number" {...field('defaultHourlyRate')} />
      <HelperMessage>Salary plus benefits and payroll taxes, per hour. Used for anyone without a personal rate.</HelperMessage>

      <Label labelFor="life">Useful life (months)</Label>
      <Textfield id="life" type="number" {...field('usefulLifeMonths')} />
      <HelperMessage>Straight-line amortization period, which starts the month after release.</HelperMessage>

      <Label labelFor="currency">Currency</Label>
      <Textfield id="currency" {...field('currency')} />

      <Button appearance="primary" onClick={save} isDisabled={saving}>Save</Button>
    </Stack>
  );
};

ForgeReconciler.render(<App />);
