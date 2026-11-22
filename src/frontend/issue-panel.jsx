import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button, ButtonGroup, DatePicker, Heading, Inline, Label, Link, List, ListItem, Lozenge, SectionMessage, Select, Spinner, Stack, Text,
  TextArea,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { CONFIDENCE_LOZENGE, money, STAGE_LABEL, TREATMENT_LOZENGE } from './format';

const TREATMENT_OPTIONS = [
  { label: 'Capitalize', value: 'capex' },
  { label: 'Expense', value: 'opex' },
];

const PR_APPEARANCE = { MERGED: 'success', OPEN: 'inprogress', DRAFT: 'default', DECLINED: 'removed' };

/** Pull requests, deployments and goals linked in Teamwork Graph, for one work item. */
const Evidence = ({ label, evidence }) => {
  if (!evidence) return null;
  const items = [
    ...evidence.pullRequests.map((p) => (
      <ListItem key={`pr-${p.url ?? p.title}`}>
        <Inline space="space.050" alignBlock="center">
          <Lozenge appearance={PR_APPEARANCE[p.status] ?? 'default'}>{p.status.toLowerCase()}</Lozenge>
          {p.url ? <Link href={p.url} openNewTab>{p.title}</Link> : <Text>{p.title}</Text>}
        </Inline>
      </ListItem>
    )),
    ...evidence.deployments.map((d) => (
      <ListItem key={`dep-${d.url ?? d.name}-${d.at}`}>
        <Text>
          Deployed to {d.environment ?? d.environmentType.toLowerCase()} ({d.state.toLowerCase()}) on {String(d.at ?? '').slice(0, 10)}
        </Text>
      </ListItem>
    )),
    ...evidence.goals.map((g) => (
      <ListItem key={`goal-${g.url ?? g.name}`}>
        <Text>Goal: {g.url ? <Link href={g.url} openNewTab>{g.name}</Link> : g.name}</Text>
      </ListItem>
    )),
  ];
  return (
    <Stack space="space.050">
      <Text size="small">{label}</Text>
      {items.length > 0
        ? <List type="unordered">{items}</List>
        : <Text size="small">{evidence.errors.length ? 'Teamwork Graph unavailable.' : 'No linked pull requests, deployments or goals.'}</Text>}
    </Stack>
  );
};

const STAGE_APPEARANCE = { preliminary: 'default', development: 'success', 'post-implementation': 'moved' };

/** Epic = software asset: stage, editable project authorization date, dates, cost and evidence. */
const EpicView = ({ data, reload }) => {
  const [date, setDate] = useState(data.authorizedAt ?? '');
  const [pickerKey, setPickerKey] = useState(0); // remounts the date picker so a clear empties it
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const a = data.asset;
  const cur = data.currency;

  const save = async (value) => {
    setSaving(true);
    setMessage(null);
    const res = await invoke('setEpicAuthorization', { authorizedAt: value });
    setSaving(false);
    if (!res.ok) return setMessage({ appearance: 'error', text: res.error });
    if (!value) {
      setDate('');
      setPickerKey((k) => k + 1);
    }
    setMessage({ appearance: 'success', text: value ? `Project authorized on ${value}.` : 'Authorization date cleared.' });
    reload();
  };

  return (
    <Stack space="space.200">
      <Inline space="space.100">
        <Lozenge appearance="new" isBold>Software asset</Lozenge>
        {a?.stageAtQuarterEnd && <Lozenge appearance={STAGE_APPEARANCE[a.stageAtQuarterEnd]}>{STAGE_LABEL[a.stageAtQuarterEnd]}</Lozenge>}
      </Inline>

      {a && (
        <List type="unordered">
          <ListItem><Text>Capitalized to date: {money(a.capexToDate, cur)}</Text></ListItem>
          <ListItem><Text>This quarter ({data.quarter}): {money(a.capex, cur)} capitalized · {money(a.opex, cur)} expensed</Text></ListItem>
          <ListItem>
            <Text>
              Placed in service: {a.releasedAt
                ? `${a.releasedAt}${a.releaseSource === 'deployment' ? ' (first production deployment)' : ' (Jira release)'}`
                : 'not yet released'}
            </Text>
          </ListItem>
          <ListItem><Text>Amortization this quarter: {money(a.amortization, cur)} · Net book value: {money(a.netBookValue, cur)}</Text></ListItem>
          {data.reviewCount > 0 && <ListItem><Text>{data.reviewCount} item(s) in this epic need controller review</Text></ListItem>}
        </List>
      )}

      <Heading as="h4">Project authorization</Heading>
      <Text>
        Work becomes capitalizable once the project is authorized (for example, an approved spec or funding decision).
        Work before this date is expensed as preliminary.
      </Text>
      <Label labelFor="authorized">Authorized on</Label>
      <DatePicker
        key={pickerKey}
        id="authorized"
        value={date || undefined}
        onChange={(v) => setDate(v ?? '')}
        dateFormat="YYYY-MM-DD"
        placeholder="YYYY-MM-DD (not authorized)"
      />
      <ButtonGroup>
        <Button appearance="primary" onClick={() => save(date)} isDisabled={!date || saving || date === data.authorizedAt}>
          Save date
        </Button>
        {data.authorizedAt && <Button appearance="subtle" onClick={() => save(null)} isDisabled={saving}>Clear</Button>}
      </ButtonGroup>
      {message && <SectionMessage appearance={message.appearance}><Text>{message.text}</Text></SectionMessage>}

      <Heading as="h4">Evidence (Teamwork Graph)</Heading>
      <Evidence label="Linked to this epic" evidence={data.evidence} />
    </Stack>
  );
};

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
  if (data.mode === 'epic') return <EpicView data={data} reload={load} />;

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

      {data.evidence && (data.evidence.issue || data.evidence.epic) && (
        <Stack space="space.100">
          <Heading as="h4">Evidence (Teamwork Graph)</Heading>
          <Evidence label="This work item" evidence={data.evidence.issue} />
          {data.epic && <Evidence label={`Epic ${data.epic.key}`} evidence={data.evidence.epic} />}
        </Stack>
      )}

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
