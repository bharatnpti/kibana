/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import dateMath from '@elastic/datemath';
import { getOr, isEmpty } from 'lodash/fp';
import moment from 'moment';

import { updateSignalStatus } from '../../containers/detection_engine/signals/api';
import { SendSignalToTimelineActionProps, UpdateSignalStatusActionProps } from './types';
import { TimelineNonEcsData, GetOneTimeline, TimelineResult, Ecs } from '../../../graphql/types';
import { oneTimelineQuery } from '../../../timelines/containers/one/index.gql_query';
import { timelineDefaults } from '../../../timelines/store/timeline/defaults';
import {
  omitTypenameInTimeline,
  formatTimelineResultToModel,
} from '../../../timelines/components/open_timeline/helpers';
import { convertKueryToElasticSearchQuery } from '../../../common/lib/keury';
import {
  replaceTemplateFieldFromQuery,
  replaceTemplateFieldFromMatchFilters,
  replaceTemplateFieldFromDataProviders,
} from './helpers';

export const getUpdateSignalsQuery = (eventIds: Readonly<string[]>) => {
  return {
    query: {
      bool: {
        filter: {
          terms: {
            _id: [...eventIds],
          },
        },
      },
    },
  };
};

export const getFilterAndRuleBounds = (
  data: TimelineNonEcsData[][]
): [string[], number, number] => {
  const stringFilter = data?.[0].filter(d => d.field === 'signal.rule.filters')?.[0]?.value ?? [];

  const eventTimes = data
    .flatMap(signal => signal.filter(d => d.field === 'signal.original_time')?.[0]?.value ?? [])
    .map(d => moment(d));

  return [stringFilter, moment.min(eventTimes).valueOf(), moment.max(eventTimes).valueOf()];
};

export const updateSignalStatusAction = async ({
  query,
  signalIds,
  status,
  setEventsLoading,
  setEventsDeleted,
}: UpdateSignalStatusActionProps) => {
  try {
    setEventsLoading({ eventIds: signalIds, isLoading: true });

    const queryObject = query ? { query: JSON.parse(query) } : getUpdateSignalsQuery(signalIds);

    await updateSignalStatus({ query: queryObject, status });
    // TODO: Only delete those that were successfully updated from updatedRules
    setEventsDeleted({ eventIds: signalIds, isDeleted: true });
  } catch (e) {
    // TODO: Show error toasts
  } finally {
    setEventsLoading({ eventIds: signalIds, isLoading: false });
  }
};

export const determineToAndFrom = ({ ecsData }: { ecsData: Ecs }) => {
  const ellapsedTimeRule = moment.duration(
    moment().diff(
      dateMath.parse(ecsData.signal?.rule?.from != null ? ecsData.signal?.rule?.from[0] : 'now-0s')
    )
  );

  const from = moment(ecsData.timestamp ?? new Date())
    .subtract(ellapsedTimeRule)
    .valueOf();
  const to = moment(ecsData.timestamp ?? new Date()).valueOf();

  return { to, from };
};

export const sendSignalToTimelineAction = async ({
  apolloClient,
  createTimeline,
  ecsData,
  updateTimelineIsLoading,
}: SendSignalToTimelineActionProps) => {
  let openSignalInBasicTimeline = true;
  const noteContent = ecsData.signal?.rule?.note != null ? ecsData.signal?.rule?.note[0] : '';
  const timelineId =
    ecsData.signal?.rule?.timeline_id != null ? ecsData.signal?.rule?.timeline_id[0] : '';
  const { to, from } = determineToAndFrom({ ecsData });

  if (timelineId !== '' && apolloClient != null) {
    try {
      updateTimelineIsLoading({ id: 'timeline-1', isLoading: true });
      const responseTimeline = await apolloClient.query<
        GetOneTimeline.Query,
        GetOneTimeline.Variables
      >({
        query: oneTimelineQuery,
        fetchPolicy: 'no-cache',
        variables: {
          id: timelineId,
        },
      });
      const resultingTimeline: TimelineResult = getOr({}, 'data.getOneTimeline', responseTimeline);

      if (!isEmpty(resultingTimeline)) {
        const timelineTemplate: TimelineResult = omitTypenameInTimeline(resultingTimeline);
        openSignalInBasicTimeline = false;
        const { timeline } = formatTimelineResultToModel(timelineTemplate, true);
        const query = replaceTemplateFieldFromQuery(
          timeline.kqlQuery?.filterQuery?.kuery?.expression ?? '',
          ecsData
        );
        const filters = replaceTemplateFieldFromMatchFilters(timeline.filters ?? [], ecsData);
        const dataProviders = replaceTemplateFieldFromDataProviders(
          timeline.dataProviders ?? [],
          ecsData
        );
        createTimeline({
          from,
          timeline: {
            ...timeline,
            dataProviders,
            eventType: 'all',
            filters,
            dateRange: {
              start: from,
              end: to,
            },
            kqlQuery: {
              filterQuery: {
                kuery: {
                  kind: timeline.kqlQuery?.filterQuery?.kuery?.kind ?? 'kuery',
                  expression: query,
                },
                serializedQuery: convertKueryToElasticSearchQuery(query),
              },
              filterQueryDraft: {
                kind: timeline.kqlQuery?.filterQuery?.kuery?.kind ?? 'kuery',
                expression: query,
              },
            },
            show: true,
          },
          to,
          ruleNote: noteContent,
        });
      }
    } catch {
      openSignalInBasicTimeline = true;
      updateTimelineIsLoading({ id: 'timeline-1', isLoading: false });
    }
  }

  if (openSignalInBasicTimeline) {
    createTimeline({
      from,
      timeline: {
        ...timelineDefaults,
        dataProviders: [
          {
            and: [],
            id: `send-signal-to-timeline-action-default-draggable-event-details-value-formatted-field-value-timeline-1-signal-id-${ecsData._id}`,
            name: ecsData._id,
            enabled: true,
            excluded: false,
            kqlQuery: '',
            queryMatch: {
              field: '_id',
              value: ecsData._id,
              operator: ':',
            },
          },
        ],
        id: 'timeline-1',
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
        kqlQuery: {
          filterQuery: {
            kuery: {
              kind: 'kuery',
              expression: '',
            },
            serializedQuery: '',
          },
          filterQueryDraft: {
            kind: 'kuery',
            expression: '',
          },
        },
      },
      to,
      ruleNote: noteContent,
    });
  }
};
