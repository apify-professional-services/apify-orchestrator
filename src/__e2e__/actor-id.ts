import { Actor } from 'apify';

let cachedActorId: string | null = null;

export async function getActorId(): Promise<string> {
    if (cachedActorId) {
        return cachedActorId;
    }
    if (Actor.isAtHome()) {
        const { actorId } = Actor.getEnv();
        if (!actorId) throw new Error('Actor ID is not defined');
        cachedActorId = actorId;
        return actorId;
    }
    const { userId } = Actor.getEnv();
    if (!userId) throw new Error('User ID is not defined');
    const user = Actor.apifyClient.user(userId);
    const { username } = await user.get();
    const actorId = `${username}/test-apify-orchestrator`;
    cachedActorId = actorId;
    return actorId;
}
