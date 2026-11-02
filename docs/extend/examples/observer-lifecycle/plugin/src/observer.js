export async function observe(delivery, context) {
  if (context.contract.config.fail === true) throw new Error('TUTORIAL_OBSERVER_FAILURE');
  let deniedCapability;
  try {
    await context.invoke('state.read', {
      operation: 'read', resource: { type: 'tutorial.note', canonicalId: 'not-granted' }, payload: {},
    });
    throw new Error('TUTORIAL_UNGRANTED_CAPABILITY_ALLOWED');
  } catch (error) {
    if (error.message !== 'PLUGIN_CAPABILITY_DENIED:state.read') throw error;
    deniedCapability = 'state.read';
  }
  await context.emit('plugin.example.observer-lifecycle.observed', delivery.event.identity, {
    sourceEventId: delivery.event.eventId,
    sourceEventType: delivery.event.type,
    sourceSequence: delivery.event.sequence,
    deniedCapability,
  });
}
