import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button, Heading, HelperMessage, Label, List, ListItem, SectionMessage, Spinner, Stack, Text, Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [demoProject, setDemoProject] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  useEffect(() => {
    invoke('getBootstrap').then((res) => {
      if (!res.ok) return setMessage({ appearance: 'error', text: res.error });
      const s = res.data.settings;
      setForm({
        projectKeys: s.projectKeys.join(', '),
        defaultHourlyRate: String(s.defaultHourlyRate),
        usefulLifeMonths: String(s.usefulLifeMonths),
        currency: s.currency,
        confluenceSpaceKey: s.confluenceSpaceKey ?? '',
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

  const seed = async () => {
    setSeeding(true);
    setSeedResult(null);
    const res = await invoke('seedDemoData', { projectKey: demoProject });
    setSeeding(false);
    setSeedResult(res);
    if (res.ok && !form.projectKeys.split(/[\s,]+/).includes(res.data.projectKey)) {
      setForm({ ...form, projectKeys: [form.projectKeys, res.data.projectKey].filter(Boolean).join(', ') });
    }
  };

  if (!form) return message ? <SectionMessage appearance="error"><Text>{message.text}</Text></SectionMessage> : <Spinner label="Loading" />;

  return (
    <Stack space="space.200">
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

      <Label labelFor="space">Confluence space for memos</Label>
      <Textfield id="space" placeholder="e.g. FIN" {...field('confluenceSpaceKey')} />
      <HelperMessage>Space key where the quarterly capitalization memo is published.</HelperMessage>

      <Button appearance="primary" onClick={save} isDisabled={saving}>Save</Button>

      <Heading as="h2">Demo data</Heading>
      <Text>
        Loads a sample payments team into an existing project: 3 epics (one released, one in development, one not yet
        approved), 16 issues and their time logs, all labelled sopher-demo. Use an empty project, because the demo adds
        real issues. Time tracking must be turned on in Jira.
      </Text>
      <Label labelFor="demo-project">Project key</Label>
      <Textfield id="demo-project" placeholder="e.g. DEMO" value={demoProject} onChange={(e) => setDemoProject(e.target.value)} />
      <Button onClick={seed} isDisabled={!demoProject.trim() || seeding}>{seeding ? 'Loading demo data…' : 'Load demo data'}</Button>
      {seeding && <Spinner label="Creating issues" />}
      {seedResult && !seedResult.ok && (
        <SectionMessage appearance="error"><Text>{seedResult.error}</Text></SectionMessage>
      )}
      {seedResult?.ok && (
        <SectionMessage appearance="success" title="Demo data loaded">
          <Text>
            Created {seedResult.data.epics} epics, {seedResult.data.issues} issues and {seedResult.data.worklogs} time logs
            in {seedResult.data.projectKey}. Open Apps → Capitalization to see the schedule.
          </Text>
          {seedResult.data.warnings.length > 0 && (
            <List type="unordered">
              {seedResult.data.warnings.map((w) => <ListItem key={w}><Text>{w}</Text></ListItem>)}
            </List>
          )}
        </SectionMessage>
      )}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
