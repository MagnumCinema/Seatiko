// Workspace setup in Twenty: the onboarding kanban and the overview dashboard,
// ported from internal/crm/pipeline.go and dashboard.go. Only adds what is missing;
// layouts managers customized are left alone.
import { createHash } from 'node:crypto';
import { type MetadataObject, recordId, stringField, type TwentyClient } from './twenty.client.js';

const PIPELINE_NAME = 'Seatiko · Подключение ресторанов';
const DASHBOARD_ID = 'd3b7d10e-dc4f-5bf9-b54d-2da803ef9572';
const DASHBOARD_NAME = 'Seatiko — обзор';
const STAGES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'];

/** RFC 4122 v5 UUID in the URL namespace (uuid.NewSHA1(uuid.NameSpaceURL, …) in Go). */
export function uuidV5Url(name: string): string {
  const ns = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const field = (o: MetadataObject | undefined, name: string) => o?.fields.find((f) => f.name === name);

type View = {
  id: string;
  name: string;
  viewFields: Array<{ fieldMetadataId: string }>;
  viewGroups: Array<{ id: string; fieldValue: string; isVisible: boolean }>;
  viewFilters: Array<{ fieldMetadataId: string; operand: string }>;
};

/** Kanban of restaurant applications grouped by Seatiko status (EnsureSeatikoPipeline). */
export async function ensurePipeline(client: TwentyClient): Promise<void> {
  const company = (await client.metadataObjects()).find((o) => o.nameSingular === 'company');
  const status = field(company, 'restaurantStatus');
  const identity = field(company, 'seatikoId');
  if (!company?.id || status?.type !== 'SELECT' || !identity) throw new Error('Twenty pipeline requires company.restaurantStatus SELECT and company.seatikoId');
  const stableId = (kind: string) => uuidV5Url(`seatiko/pipeline/${company.id}/${kind}`);
  const query = `query SeatikoPipeline($objectID:String!){getViews(objectMetadataId:$objectID){id name viewFields{fieldMetadataId} viewGroups{id fieldValue isVisible} viewFilters{fieldMetadataId operand}}}`;
  const views = async () => (await client.graphql<{ getViews: View[] }>(query, { objectID: company.id })).getViews;

  const named = (await views()).filter((v) => v.name === PIPELINE_NAME);
  if (named.length > 1) throw new Error('Twenty pipeline has duplicate named views');
  let view = named[0];
  if (!view) {
    const created = await client.graphql<{ createView: { id: string } }>(`mutation SeatikoCreatePipeline($input:CreateViewInput!){createView(input:$input){id}}`, {
      input: {
        id: stableId('view'),
        name: PIPELINE_NAME,
        objectMetadataId: company.id,
        type: 'KANBAN',
        icon: 'IconBuildingStore',
        visibility: 'WORKSPACE',
        mainGroupByFieldMetadataId: status.id,
        kanbanAggregateOperation: 'COUNT',
        shouldHideEmptyGroups: false,
        position: 1,
      },
    });
    view = (await views()).find((v) => v.id === created.createView.id) as View;
    if (!view) throw new Error('Twenty pipeline is not visible yet; retry setup');
    for (const g of view.viewGroups) {
      if (g.fieldValue === '' && g.id && g.isVisible) {
        await client.graphql(`mutation SeatikoPipelineHideEmpty($input:UpdateViewGroupInput!){updateViewGroup(input:$input){id}}`, { input: { id: g.id, update: { isVisible: false } } });
      }
    }
  }
  const shown = new Set(view.viewFields.map((x) => x.fieldMetadataId));
  for (const [position, name] of ['name', 'restaurantStatus', 'cityName', 'restaurantPhones', 'restaurantEmails', 'submittedAt', 'rejectReason'].entries()) {
    const fm = field(company, name);
    if (!fm || shown.has(fm.id)) continue;
    await client.graphql(`mutation SeatikoPipelineField($input:CreateViewFieldInput!){createViewField(input:$input){id}}`, {
      input: { id: stableId(`field/${fm.id}`), viewId: view.id, fieldMetadataId: fm.id, isVisible: true, position, size: 180 },
    });
  }
  const groups = new Set(view.viewGroups.map((g) => g.fieldValue));
  for (const [position, stage] of STAGES.entries()) {
    if (groups.has(stage)) continue;
    await client.graphql(`mutation SeatikoPipelineGroup($input:CreateViewGroupInput!){createViewGroup(input:$input){id}}`, {
      input: { id: stableId(`group/${stage}`), viewId: view.id, fieldValue: stage, isVisible: true, position },
    });
  }
  if (view.viewFilters.some((x) => x.fieldMetadataId === identity.id && x.operand === 'IS_NOT_EMPTY')) return;
  await client.graphql(`mutation SeatikoPipelineFilter($input:CreateViewFilterInput!){createViewFilter(input:$input){id}}`, {
    input: { id: stableId('filter/identity'), viewId: view.id, fieldMetadataId: identity.id, operand: 'IS_NOT_EMPTY', value: '' },
  });
}

type Layout = { id: string; name: string; tabs: Array<{ id: string; title: string; widgets: Array<{ id: string; title: string }> }> };

function dashboardWidgets(objects: Map<string, MetadataObject>): Array<Record<string, unknown>> {
  const specs: Array<[string, string, string, number, number, number, number]> = [
    ['Заявки ресторанов', 'company', '', 0, 0, 2, 6],
    ['Бронирования', 'reservation', '', 0, 6, 2, 6],
    ['Заявки по статусам', 'company', 'restaurantStatus', 2, 0, 6, 6],
    ['Бронирования по статусам', 'reservation', 'bookingStatus', 2, 6, 6, 6],
    ['Заявки по городам', 'company', 'cityName', 8, 0, 6, 12],
  ];
  return specs.map(([title, objectName, group, row, column, rowSpan, columnSpan]) => {
    const object = objects.get(objectName);
    const idField = field(object, 'id');
    const identityField = field(object, objectName === 'reservation' ? 'seatikoReservationId' : 'seatikoId');
    if (!object?.id || !idField || !identityField) throw new Error(`Twenty dashboard requires ${objectName}.id and its Seatiko id`);
    const configuration: Record<string, unknown> = {
      configurationType: 'AGGREGATE_CHART',
      aggregateFieldMetadataId: idField.id,
      aggregateOperation: 'COUNT',
      displayDataLabel: true,
      timezone: 'Europe/Chisinau',
      firstDayOfTheWeek: 1,
      filter: {
        recordFilters: [
          {
            id: uuidV5Url(`seatiko/dashboard/${object.id}/${title}/identity`),
            fieldMetadataId: identityField.id,
            type: 'TEXT',
            operand: 'IS_NOT_EMPTY',
            value: '',
            displayValue: '',
            label: 'Seatiko ID',
          },
        ],
        recordFilterGroups: [],
      },
    };
    if (group) {
      const g = field(object, group);
      if (!g) throw new Error(`Twenty dashboard requires ${objectName}.${group}`);
      Object.assign(configuration, {
        configurationType: 'BAR_CHART',
        primaryAxisGroupByFieldMetadataId: g.id,
        primaryAxisOrderBy: 'FIELD_ASC',
        axisNameDisplay: 'NONE',
        displayLegend: false,
        layout: 'VERTICAL',
        color: 'blue',
      });
    }
    return { title, type: 'GRAPH', objectMetadataId: object.id, position: { layoutMode: 'GRID', row, column, rowSpan, columnSpan }, configuration };
  });
}

/** "Seatiko — обзор" dashboard with native Twenty charts over Seatiko records (EnsureSeatikoDashboard). */
export async function ensureDashboard(client: TwentyClient): Promise<void> {
  const objects = new Map((await client.metadataObjects()).map((o) => [o.nameSingular, o]));
  const widgets = dashboardWidgets(objects);
  const { getPageLayouts: layouts } = await client.graphql<{ getPageLayouts: Layout[] }>(`{getPageLayouts(pageLayoutType:DASHBOARD){id name tabs{id title widgets{id title}}}}`);
  const linked = (await client.listAll('dashboards')).find((d) => recordId(d) === DASHBOARD_ID);
  const linkedLayoutId = linked ? stringField(linked, 'pageLayoutId') : '';
  if (linked && !linkedLayoutId) throw new Error('Seatiko dashboard has no page layout');
  const candidates = layouts.filter((l) => (linkedLayoutId ? l.id === linkedLayoutId : l.name === DASHBOARD_NAME));
  if (candidates.length > 1) throw new Error('multiple Seatiko dashboard layouts found');
  if (linkedLayoutId && !candidates.length) throw new Error(`Seatiko dashboard layout ${linkedLayoutId} is missing`);
  let layout = candidates[0];
  if (!layout) {
    layout = { ...(await client.graphql<{ createPageLayout: Layout }>(`mutation($input:CreatePageLayoutInput!){createPageLayout(input:$input){id name}}`, { input: { name: DASHBOARD_NAME, type: 'DASHBOARD' } })).createPageLayout, tabs: [] };
  }
  const tabs = (layout.tabs ?? []).filter((t) => t.title === 'Показатели');
  if (tabs.length > 1) throw new Error('multiple Seatiko dashboard tabs found');
  const tab = tabs[0] ?? {
    ...(await client.graphql<{ createPageLayoutTab: { id: string; title: string } }>(`mutation($input:CreatePageLayoutTabInput!){createPageLayoutTab(input:$input){id title}}`, {
      input: { pageLayoutId: layout.id, title: 'Показатели', position: 0 },
    })).createPageLayoutTab,
    widgets: [],
  };
  for (const widget of widgets) {
    const present = (tab.widgets ?? []).filter((w) => w.title === widget.title).length;
    if (present > 1) throw new Error(`multiple Seatiko dashboard widgets named "${String(widget.title)}"`);
    if (present === 1) continue;
    await client.graphql(`mutation($input:CreatePageLayoutWidgetInput!){createPageLayoutWidget(input:$input){id title}}`, { input: { ...widget, pageLayoutTabId: tab.id } });
  }
  if (!linkedLayoutId) await client.create('dashboards', { id: DASHBOARD_ID, title: DASHBOARD_NAME, pageLayoutId: layout.id });
}
