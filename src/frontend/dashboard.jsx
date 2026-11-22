import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, DynamicTable, Heading, Inline, Link, Lozenge, SectionMessage, Select, Spinner, Stack,
  StackBarChart, Text, Textfield, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { money, pct, STAGE_LABEL } from './format';

const card = xcss({
  padding: 'space.200',
  borderRadius: 'border.radius.200',
  backgroundColor: 'color.background.neutral',
  minWidth: '150px',
});

const STAGE_APPEARANCE = { preliminary: 'default', development: 'success', 'post-implementation': 'moved' };

const Stat = ({ label, value }) => (
  <Box xcss={card}>
    <Stack space="space.050">
      <Text size="small">{label}</Text>
      <Heading as="h3">{value}</Heading>
    </Stack>
  </Box>
);

const IssueLink = ({ issueKey, summary }) => (
  <Text><Link href={`/browse/${issueKey}`}>{issueKey}</Link> · {summary}</Text>
);

const App = () => {
  const [boot, setBoot] = useState(null);
  const [projectKey, setProjectKey] = useState('');
  const [quarter, setQuarter] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [spaceKey, setSpaceKey] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [memo, setMemo] = useState(null);

  useEffect(() => {
    invoke('getBootstrap').then((res) => {
      if (!res.ok) return setError(res.error);
      setBoot(res.data);
      setQuarter(res.data.quarters[0]);
      setProjectKey(res.data.settings.projectKeys[0] ?? '');
      setSpaceKey(res.data.settings.confluenceSpaceKey ?? '');
    });
  }, []);

  // Loads take their inputs explicitly, so a load always matches what the pickers show.
  const load = async (pk, q) => {
    if (!pk || !q) return;
    setLoading(true);
    setError(null);
    setMemo(null);
    const res = await invoke('getSchedule', { projectKey: pk, quarter: q });
    setLoading(false);
    if (!res.ok) {
      setSchedule(null);
      return setError(res.error);
    }
    setSchedule(res.data);
  };

  useEffect(() => {
    load(projectKey, quarter);
  }, [projectKey, quarter]); // eslint-disable-line react-hooks/exhaustive-deps

  const publish = async () => {
    setPublishing(true);
    setMemo(null);
    const res = await invoke('publishMemo', { projectKey, quarter, spaceKey });
    setPublishing(false);
    setMemo(res);
  };

  if (!boot && !error) return <Spinner label="Loading" />;
  const cur = schedule?.currency ?? boot?.settings.currency ?? 'USD';
  const projectOptions = (boot?.settings.projectKeys ?? []).map((k) => ({ label: k, value: k }));

  if (boot && projectOptions.length === 0) {
    return (
      <SectionMessage appearance="information" title="Pick the projects to track">
        <Text>
          Sopher isn't tracking any Jira projects yet. Open Jira settings → Apps → Sopher settings to add your
          project keys, or load the demo data into an empty project to try it.
        </Text>
      </SectionMessage>
    );
  }

  const trendData = (schedule?.trend ?? []).flatMap((t) => [
    { quarter: t.quarter, treatment: 'Capitalized', amount: t.capex },
    { quarter: t.quarter, treatment: 'Expensed', amount: t.opex },
  ]);

  return (
    <Stack space="space.300">
      <Text>
        Engineering work in Jira, classified as capitalized or expensed under ASC 350-40, with amortization per software
        asset.
      </Text>

      <Inline space="space.200" alignBlock="end">
        <Box xcss={xcss({ width: '200px' })}>
          <Select
            aria-label="Project"
            options={projectOptions}
            value={projectOptions.find((o) => o.value === projectKey)}
            onChange={(o) => setProjectKey(o.value)}
          />
        </Box>
        <Box xcss={xcss({ width: '160px' })}>
          <Select
            aria-label="Quarter"
            options={(boot?.quarters ?? []).map((q) => ({ label: q, value: q }))}
            value={quarter && { label: quarter, value: quarter }}
            onChange={(o) => setQuarter(o.value)}
          />
        </Box>
        <Button onClick={() => load(projectKey, quarter)} isDisabled={loading}>Refresh</Button>
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
              <Text>
                {money(schedule.totals.estimatedCost, cur)} of this quarter's cost comes from original estimates because
                no time was logged.
              </Text>
            </SectionMessage>
          )}

          {trendData.length > 0 && (
            <StackBarChart
              title="Capitalized vs expensed, last four quarters"
              data={trendData}
              xAccessor="quarter"
              yAccessor="amount"
              colorAccessor="treatment"
              height={280}
            />
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
              { key: 'evidence', content: 'Evidence (Teamwork Graph)' },
            ] }}
            rows={schedule.assets.map((a) => ({
              key: a.epicKey ?? 'none',
              cells: [
                { key: 'asset', content: a.epicKey ? <IssueLink issueKey={a.epicKey} summary={a.summary} /> : a.summary },
                {
                  key: 'stage',
                  content: a.stageAtQuarterEnd
                    ? <Lozenge appearance={STAGE_APPEARANCE[a.stageAtQuarterEnd]}>{STAGE_LABEL[a.stageAtQuarterEnd]}</Lozenge>
                    : '—',
                },
                { key: 'capex', content: money(a.capex, cur) },
                { key: 'opex', content: money(a.opex, cur) },
                { key: 'amort', content: money(a.amortization, cur) },
                { key: 'nbv', content: money(a.netBookValue, cur) },
                {
                  key: 'evidence',
                  content: a.epicKey
                    ? `${a.evidenceText ?? 'Not checked'}${a.releaseSource === 'deployment' ? ` · in service ${a.releasedAt} (deployment)` : ''}`
                    : '—',
                },
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
                { key: 'issue', content: <IssueLink issueKey={r.key} summary={r.summary} /> },
                { key: 'conf', content: <Lozenge appearance={r.confidence === 'low' ? 'removed' : 'moved'}>{r.confidence}</Lozenge> },
                { key: 'why', content: r.reasons[0] },
              ],
            }))}
            emptyView="Nothing to review for this quarter."
          />

          <Heading as="h2">Quarter-end memo</Heading>
          <Text>Publish this quarter's capitalization memo to Confluence for controller sign-off.</Text>
          <Inline space="space.100" alignBlock="end">
            <Textfield
              aria-label="Confluence space key"
              placeholder="Confluence space key"
              value={spaceKey}
              onChange={(e) => setSpaceKey(e.target.value)}
            />
            <Button appearance="primary" onClick={publish} isDisabled={!spaceKey.trim() || publishing}>
              {publishing ? 'Publishing memo…' : `Publish ${schedule.quarter} memo`}
            </Button>
          </Inline>
          {memo && !memo.ok && <SectionMessage appearance="error"><Text>{memo.error}</Text></SectionMessage>}
          {memo?.ok && (
            <SectionMessage appearance="success">
              <Text>
                {memo.data.created ? 'Memo created' : `Memo updated (version ${memo.data.version})`} in {memo.data.spaceKey}.{' '}
                {memo.data.url && <Link href={memo.data.url} openNewTab>Open {memo.data.title}</Link>}
              </Text>
            </SectionMessage>
          )}
        </Stack>
      )}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
