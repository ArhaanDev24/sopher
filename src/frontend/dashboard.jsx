import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, DynamicTable, Heading, Inline, Lozenge, SectionMessage, Select, Spinner, Stack, Text, Textfield, Button, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { money, pct, STAGE_LABEL } from './format';

const card = xcss({ padding: 'space.200', borderRadius: 'border.radius.200', backgroundColor: 'color.background.neutral', minWidth: '160px' });

const Stat = ({ label, value }) => (
  <Box xcss={card}>
    <Stack space="space.050">
      <Text size="small">{label}</Text>
      <Heading as="h3">{value}</Heading>
    </Stack>
  </Box>
);

const App = () => {
  const [boot, setBoot] = useState(null);
  const [projectKey, setProjectKey] = useState('');
  const [quarter, setQuarter] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke('getBootstrap').then((res) => {
      if (!res.ok) return setError(res.error);
      setBoot(res.data);
      setQuarter(res.data.quarters[0]);
      if (res.data.settings.projectKeys[0]) setProjectKey(res.data.settings.projectKeys[0]);
    });
  }, []);

  const load = async () => {
    if (!projectKey) return;
    setLoading(true);
    setError(null);
    const res = await invoke('getSchedule', { projectKey, quarter });
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setSchedule(res.data);
  };

  useEffect(() => {
    if (projectKey && quarter) load();
  }, [quarter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!boot && !error) return <Spinner label="Loading" />;
  const cur = schedule?.currency ?? boot?.settings.currency ?? 'USD';
  const projectOptions = (boot?.settings.projectKeys ?? []).map((k) => ({ label: k, value: k }));

  return (
    <Stack space="space.300">
      <Heading as="h1">Software capitalization</Heading>
      <Inline space="space.200" alignBlock="end">
        {projectOptions.length > 0 ? (
          <Box xcss={xcss({ width: '200px' })}>
            <Select
              aria-label="Project"
              options={projectOptions}
              value={projectOptions.find((o) => o.value === projectKey)}
              onChange={(o) => setProjectKey(o.value)}
            />
          </Box>
        ) : (
          <Textfield aria-label="Project key" placeholder="Project key, e.g. PAY" value={projectKey} onChange={(e) => setProjectKey(e.target.value)} />
        )}
        <Box xcss={xcss({ width: '160px' })}>
          <Select
            aria-label="Quarter"
            options={(boot?.quarters ?? []).map((q) => ({ label: q, value: q }))}
            value={quarter && { label: quarter, value: quarter }}
            onChange={(o) => setQuarter(o.value)}
          />
        </Box>
        <Button appearance="primary" onClick={load} isDisabled={!projectKey || loading}>Calculate</Button>
      </Inline>

      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      {loading && <Spinner label="Calculating" />}

      {schedule && !loading && (
        <Stack space="space.300">
          <Inline space="space.200" shouldWrap>
            <Stat label={`Capitalized in ${schedule.quarter}`} value={money(schedule.totals.capex, cur)} />
            <Stat label="Expensed" value={money(schedule.totals.opex, cur)} />
            <Stat label="Capitalization rate" value={pct(schedule.totals.capitalizationRate)} />
            <Stat label="Amortization" value={money(schedule.totals.amortization, cur)} />
            <Stat label="Net book value" value={money(schedule.totals.netBookValue, cur)} />
          </Inline>
          {schedule.totals.estimatedCost > 0 && (
            <SectionMessage appearance="warning">
              <Text>{money(schedule.totals.estimatedCost, cur)} of this quarter's cost comes from original estimates because no time was logged.</Text>
            </SectionMessage>
          )}

          <Heading as="h2">Software assets</Heading>
          <DynamicTable
            head={{ cells: [
              { key: 'asset', content: 'Asset (epic)' },
              { key: 'stage', content: 'Stage at quarter end' },
              { key: 'capex', content: 'Capitalized' },
              { key: 'opex', content: 'Expensed' },
              { key: 'amort', content: 'Amortization' },
              { key: 'nbv', content: 'Net book value' },
            ] }}
            rows={schedule.assets.map((a) => ({
              key: a.epicKey ?? 'none',
              cells: [
                { key: 'asset', content: a.epicKey ? `${a.epicKey} · ${a.summary}` : a.summary },
                { key: 'stage', content: a.stageAtQuarterEnd ? <Lozenge>{STAGE_LABEL[a.stageAtQuarterEnd]}</Lozenge> : '—' },
                { key: 'capex', content: money(a.capex, cur) },
                { key: 'opex', content: money(a.opex, cur) },
                { key: 'amort', content: money(a.amortization, cur) },
                { key: 'nbv', content: money(a.netBookValue, cur) },
              ],
            }))}
            emptyView="No epics in this project."
          />

          <Heading as="h2">Needs controller review ({schedule.reviewQueue.length})</Heading>
          <DynamicTable
            head={{ cells: [
              { key: 'issue', content: 'Issue' },
              { key: 'conf', content: 'Confidence' },
              { key: 'why', content: 'Why' },
            ] }}
            rows={schedule.reviewQueue.map((r) => ({
              key: r.key,
              cells: [
                { key: 'issue', content: `${r.key} · ${r.summary}` },
                { key: 'conf', content: <Lozenge appearance={r.confidence === 'low' ? 'removed' : 'moved'}>{r.confidence}</Lozenge> },
                { key: 'why', content: r.reasons[0] },
              ],
            }))}
            emptyView="Nothing to review for this quarter."
          />
        </Stack>
      )}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
