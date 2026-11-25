// Confluence macro: live capitalization figures for one Jira project and quarter, embedded in any
// page (for example next to the quarter-end memo). It calls the same getSchedule resolver as the
// Jira dashboard, so the numbers always match.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, DynamicTable, Heading, Inline, Label, Link, Lozenge, SectionMessage, Spinner, Stack, Text, Textfield,
  useConfig, useProductContext, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { money, pct, STAGE_LABEL } from './format';

const card = xcss({
  padding: 'space.150',
  borderRadius: 'border.radius.200',
  backgroundColor: 'color.background.neutral',
  minWidth: '130px',
});

const Stat = ({ label, value }) => (
  <Box xcss={card}>
    <Stack space="space.050">
      <Text size="small">{label}</Text>
      <Heading as="h4">{value}</Heading>
    </Stack>
  </Box>
);

const App = () => {
  const config = useConfig();
  const context = useProductContext();
  const projectKey = String(config?.projectKey ?? '').trim();
  const quarter = String(config?.quarter ?? '').trim();
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!projectKey) return;
    setSchedule(null);
    setError(null);
    invoke('getSchedule', { projectKey, quarter: quarter || undefined }).then((res) => {
      if (res.ok) setSchedule(res.data);
      else setError(res.error);
    });
  }, [projectKey, quarter]);

  if (!projectKey) {
    return (
      <SectionMessage appearance="information" title="Sopher capitalization schedule">
        <Text>Edit this macro and enter a Jira project key (and optionally a quarter such as 2026-Q4).</Text>
      </SectionMessage>
    );
  }
  if (error) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!schedule) return <Spinner label="Loading capitalization figures" />;

  const cur = schedule.currency ?? 'USD';
  const site = context?.siteUrl ?? '';
  const t = schedule.totals;

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Heading as="h3">{schedule.projectKey} · {schedule.quarter} capitalization</Heading>
        {schedule.close
          ? <Lozenge appearance="success" isBold>Closed {String(schedule.close.at).slice(0, 10)}</Lozenge>
          : <Lozenge>Open</Lozenge>}
      </Inline>

      <Inline space="space.150" shouldWrap>
        <Stat label="Capitalized" value={money(t.capex, cur)} />
        <Stat label="Expensed" value={money(t.opex, cur)} />
        <Stat label="Capitalization rate" value={pct(t.capitalizationRate)} />
        <Stat label="Amortization" value={money(t.amortization, cur)} />
        <Stat label="Net book value" value={money(t.netBookValue, cur)} />
        <Stat label="Operating income effect" value={`+${money(t.operatingIncomeEffect, cur)}`} />
      </Inline>

      {schedule.stateSource === 'local' && (
        <SectionMessage appearance="information">
          <Text>
            Sopher's settings and controller decisions for {schedule.projectKey} haven't been shared from Jira yet, so
            default settings are used. Open the Capitalization dashboard in Jira once to share them.
          </Text>
        </SectionMessage>
      )}
      {schedule.personalRatesOmitted > 0 && (
        <SectionMessage appearance="information">
          <Text>Personal hourly rates are kept private to Jira, so this view uses the default rate for everyone.</Text>
        </SectionMessage>
      )}

      {schedule.drift?.hasDrift && (
        <SectionMessage appearance="warning" title="Changed since close">
          <Text>
            {schedule.drift.changes.length} issue(s) changed after {schedule.quarter} was closed: capitalized
            {' '}{schedule.drift.totals.capexDelta >= 0 ? '+' : ''}{money(schedule.drift.totals.capexDelta, cur)}.
            See the Capitalization dashboard in Jira for details.
          </Text>
        </SectionMessage>
      )}

      <DynamicTable
        head={{ cells: [
          { key: 'asset', content: 'Software asset (epic)' },
          { key: 'stage', content: 'Stage' },
          { key: 'capex', content: 'Capitalized' },
          { key: 'amort', content: 'Amortization' },
          { key: 'nbv', content: 'Net book value' },
          { key: 'evidence', content: 'Evidence' },
        ] }}
        rows={schedule.assets.filter((a) => a.epicKey).map((a) => ({
          key: a.epicKey,
          cells: [
            { key: 'asset', content: <Text><Link href={`${site}/browse/${a.epicKey}`} openNewTab>{a.epicKey}</Link> · {a.summary}</Text> },
            { key: 'stage', content: a.stageAtQuarterEnd ? STAGE_LABEL[a.stageAtQuarterEnd] : '—' },
            { key: 'capex', content: money(a.capex, cur) },
            { key: 'amort', content: money(a.amortization, cur) },
            { key: 'nbv', content: money(a.netBookValue, cur) },
            { key: 'evidence', content: a.evidenceText ?? '—' },
          ],
        }))}
        emptyView="No epics in this project."
      />

      <Text size="small">
        {schedule.reviewQueue.length > 0
          ? `${schedule.reviewQueue.length} item(s) need controller review. `
          : 'Nothing needs controller review. '}
        Live from Jira, calculated by Sopher under ASC 350-40 / IAS 38. Refresh the page for the latest figures.
      </Text>
    </Stack>
  );
};

const Config = () => (
  <>
    <Label labelFor="projectKey">Jira project key</Label>
    <Textfield id="projectKey" name="projectKey" placeholder="e.g. DEMO" />
    <Label labelFor="quarter">Quarter (optional)</Label>
    <Textfield id="quarter" name="quarter" placeholder="e.g. 2026-Q4. Blank means the current quarter" />
  </>
);

ForgeReconciler.render(<App />);
ForgeReconciler.addConfig(<Config />);
