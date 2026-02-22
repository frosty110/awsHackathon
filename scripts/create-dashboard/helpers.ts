export const LIVE_1H = { type: 'live', unit: 'hour', value: 1 };
export const SVC_ENV = '{service:$service,env:$env}';
export const llm = (extra = '') =>
  `@ml_app:ai-dm @event_type:span${extra ? ' ' + extra : ''}`;
