import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button, ButtonGroup, Heading, Inline, Label, List, ListItem, Lozenge, SectionMessage, Select, Spinner, Stack, Text, TextArea,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { CONFIDENCE_LOZENGE, money, STAGE_LABEL, TREATMENT_LOZENGE } from './format';

const TREATMENT_OPTIONS = [
  { label: 'Capitalize', value: 'capex' },
  { label: 'Expense', value: 'opex' },
];

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [treatment, setTreatment] = useState(TREATMENT_OPTIONS[0]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await invoke('getIssueClassification');
    if (!res.ok) return setError(res.error);
    setError(null);
    setData(res.data);
  };
  useEffect(() => { load(); }, []);

  const save = async (clear = false) => {
    setSaving(true);
    const res = await invoke('setOverride', clear ? { clear: true } : { treatment: treatment.value, reason });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setEditing(false);
    setReason('');
    load();
  };

  if (error && !data) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Spinner label="Classifying" />;

  const t = TREATMENT_LOZENGE[data.treatment];
  const c = CONFIDENCE_LOZENGE[data.confidence];
  const byStage = data.entries.reduce((acc, e) => {
    acc[e.stage] = (acc[e.stage] ?? 0) + e.cost;
    return acc;
  }, {});

  return (
    <Stack space="space.200">
      <Inline space="space.100">
        <Lozenge appearance={t.appearance} isBold>{t.label}</Lozenge>
        <Lozenge appearance={c.appearance}>{c.label}</Lozenge>
        {data.overridden && <Lozenge appearance="new">Overridden</Lozenge>}
      </Inline>

      <Text>
        {money(data.capex, data.currency)} capitalized · {money(data.opex, data.currency)} expensed · {data.hours}h
      </Text>

      {Object.keys(byStage).length > 1 && (
        <List type="unordered">
          {Object.entries(byStage).map(([stage, cost]) => (
            <ListItem key={stage}><Text>{STAGE_LABEL[stage]}: {money(cost, data.currency)}</Text></ListItem>
          ))}
        </List>
      )}

      <Heading as="h4">Why</Heading>
      <List type="unordered">
        {data.reasons.map((r) => <ListItem key={r}><Text>{r}</Text></ListItem>)}
      </List>

      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}

      {editing ? (
        <Stack space="space.100">
          <Label labelFor="treatment">Treatment</Label>
          <Select inputId="treatment" options={TREATMENT_OPTIONS} value={treatment} onChange={setTreatment} />
          <Label labelFor="reason">Reason (kept as audit evidence)</Label>
          <TextArea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <ButtonGroup>
            <Button appearance="primary" onClick={() => save(false)} isDisabled={!reason.trim() || saving}>Save override</Button>
            <Button appearance="subtle" onClick={() => setEditing(false)}>Cancel</Button>
          </ButtonGroup>
        </Stack>
      ) : (
        <ButtonGroup>
          <Button onClick={() => setEditing(true)}>Override</Button>
          {data.overridden && <Button appearance="subtle" onClick={() => save(true)} isDisabled={saving}>Remove override</Button>}
        </ButtonGroup>
      )}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
