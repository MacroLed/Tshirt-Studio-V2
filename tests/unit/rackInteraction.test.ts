import { describe, expect, it } from 'vitest';
import { RackInteraction, ringDistance } from '@/features/rack/RackInteraction';

function settle(interaction: RackInteraction, maxSeconds = 8): void {
  for (let t = 0; t < maxSeconds && interaction.step(1 / 60); t += 1 / 60);
}

describe('ringDistance', () => {
  it('liczy najkrótszą drogę ze znakiem i zawija się', () => {
    expect(ringDistance(0, 1, 8)).toBe(1);
    expect(ringDistance(0, 7, 8)).toBe(-1);
    expect(ringDistance(7, 0, 8)).toBe(1);
    expect(ringDistance(2, 2, 8)).toBe(0);
  });
});

describe('najechanie: ruch jak od ręki', () => {
  it('koszulka wychyla się dołem na zewnątrz, ale zostaje na obręczy', () => {
    const interaction = new RackInteraction(8);
    interaction.hovered = 2;
    settle(interaction);
    const pose = interaction.pose(2);
    expect(pose.tiltX).toBeLessThan(-0.2);
    expect(pose.faceCamera).toBeGreaterThan(0);
    expect(pose.takeOff).toBe(0);
    expect(pose.slideRadians).toBeCloseTo(0);
  });

  it('sąsiedzi rozsuwają się w przeciwne strony, a dalsi słabiej', () => {
    const interaction = new RackInteraction(8);
    interaction.hovered = 2;
    settle(interaction);
    expect(interaction.pose(3).slideRadians).toBeGreaterThan(0);
    expect(interaction.pose(1).slideRadians).toBeCloseTo(-interaction.pose(3).slideRadians, 3);
    expect(Math.abs(interaction.pose(4).slideRadians)).toBeLessThan(interaction.pose(3).slideRadians);
    expect(interaction.pose(4).slideRadians).toBeGreaterThan(0);
    expect(interaction.pose(6).slideRadians).toBeCloseTo(0);
  });

  it('rozsuwanie działa też przez początek listy', () => {
    const interaction = new RackInteraction(8);
    interaction.hovered = 0;
    settle(interaction);
    expect(interaction.pose(7).slideRadians).toBeLessThan(0);
    expect(interaction.pose(1).slideRadians).toBeGreaterThan(0);
  });

  it('sąsiedzi nie wjeżdżają na kolejne koszulki', () => {
    const interaction = new RackInteraction(8);
    interaction.hovered = 0;
    settle(interaction);
    const step = (Math.PI * 2) / 8;
    expect(interaction.pose(1).slideRadians).toBeLessThan(step * 0.5);
    const gap = step + interaction.pose(2).slideRadians - interaction.pose(1).slideRadians;
    expect(gap).toBeGreaterThan(step * 0.6);
  });

  it('wychylenie przebiega i wraca, czyli koszulka się kołysze', () => {
    const interaction = new RackInteraction(8);
    interaction.hovered = 0;
    let deepest = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      interaction.step(1 / 60);
      deepest = Math.min(deepest, interaction.pose(0).tiltX);
    }
    expect(deepest).toBeLessThan(-0.3);
    expect(interaction.pose(0).tiltX).toBeCloseTo(-0.3, 2);
  });

  it('w ruchu po tkaninie idzie fala, a w spoczynku jej nie ma', () => {
    const interaction = new RackInteraction(8);
    interaction.hovered = 0;
    for (let t = 0; t < 0.1; t += 1 / 60) interaction.step(1 / 60);
    expect(interaction.pose(0).wave).toBeGreaterThan(0);
    settle(interaction);
    expect(interaction.pose(0).wave).toBeLessThan(0.0005);
  });

  it('po zjechaniu kursorem wszystko wraca na miejsce i animacja się kończy', () => {
    const interaction = new RackInteraction(8);
    interaction.hovered = 3;
    settle(interaction);
    interaction.hovered = null;
    settle(interaction);
    for (let index = 0; index < 8; index += 1) {
      const pose = interaction.pose(index);
      expect(pose.tiltX).toBeCloseTo(0, 2);
      expect(pose.slideRadians).toBeCloseTo(0, 2);
    }
    expect(interaction.step(1 / 60)).toBe(false);
  });
});

describe('kliknięcie: zdjęcie ze stojaka', () => {
  it('koszulka schodzi z obręczy bez odbicia i patrzy wprost w kamerę', () => {
    const interaction = new RackInteraction(8);
    interaction.selected = 4;
    let last = 0;
    for (let t = 0; t < 4; t += 1 / 60) {
      interaction.step(1 / 60);
      const { takeOff } = interaction.pose(4);
      expect(takeOff).toBeGreaterThanOrEqual(last - 1e-6);
      last = takeOff;
    }
    const pose = interaction.pose(4);
    expect(pose.takeOff).toBeCloseTo(1, 2);
    expect(pose.faceCamera).toBeCloseTo(1, 2);
    expect(pose.tiltX).toBeCloseTo(0, 2);
    expect(interaction.selectionProgress).toBeCloseTo(1, 2);
  });

  it('po wyborze najechanie na inną koszulkę jej nie rusza', () => {
    const interaction = new RackInteraction(8);
    interaction.selected = 0;
    interaction.hovered = 4;
    settle(interaction);
    expect(interaction.pose(4).tiltX).toBeCloseTo(0, 2);
  });

  it('zamknięcie odwiesza koszulkę z powrotem', () => {
    const interaction = new RackInteraction(8);
    interaction.selected = 0;
    settle(interaction);
    interaction.selected = null;
    settle(interaction);
    expect(interaction.pose(0).takeOff).toBeCloseTo(0, 2);
    expect(interaction.selectionProgress).toBeCloseTo(0, 2);
  });
});

describe('oglądanie zdjętej koszulki', () => {
  it('obraca tylko wybraną koszulkę i się zatrzymuje', () => {
    const interaction = new RackInteraction(8);
    interaction.setSelected(2);
    interaction.rotateViewBy(1, 0.2);
    settle(interaction);
    expect(interaction.pose(2).viewYaw).toBeCloseTo(1, 2);
    expect(interaction.pose(2).viewPitch).toBeCloseTo(0.2, 2);
    expect(interaction.pose(3).viewYaw).toBe(0);
    expect(interaction.step(1 / 60)).toBe(false);
  });

  it('bez wyboru nie ma czego obracać ani przybliżać', () => {
    const interaction = new RackInteraction(8);
    interaction.rotateViewBy(1, 1);
    interaction.zoomViewBy(-0.5);
    settle(interaction);
    expect(interaction.pose(0).viewYaw).toBe(0);
    expect(interaction.viewZoom).toBe(1);
    expect(interaction.viewTarget).toEqual({ yaw: 0, pitch: 0 });
  });

  it('pozwala na wiele pełnych obrotów, ale pochylenie ma granice', () => {
    const interaction = new RackInteraction(8);
    interaction.setSelected(0);
    interaction.rotateViewBy(Math.PI * 5, 5);
    settle(interaction);
    expect(interaction.pose(0).viewYaw).toBeCloseTo(Math.PI * 5, 1);
    expect(interaction.pose(0).viewPitch).toBeCloseTo(Math.PI / 3, 2);
    interaction.rotateViewBy(0, -10);
    expect(interaction.viewTarget.pitch).toBeCloseTo(-Math.PI / 3, 5);
  });

  it('przybliżanie ma granice', () => {
    const interaction = new RackInteraction(8);
    interaction.setSelected(0);
    interaction.zoomViewBy(-5);
    settle(interaction);
    expect(interaction.viewZoom).toBeCloseTo(0.35, 2);
    interaction.zoomViewBy(5);
    settle(interaction);
    expect(interaction.viewZoom).toBeCloseTo(1.3, 2);
  });

  it('po odwieszeniu koszulka wraca najkrótszą drogą, bez odkręcania obrotów', () => {
    const interaction = new RackInteraction(8);
    interaction.setSelected(0);
    interaction.rotateViewBy(Math.PI * 4 + 0.5, 0.3);
    interaction.zoomViewBy(-0.3);
    settle(interaction);
    interaction.setSelected(null);
    interaction.step(1 / 60);
    expect(Math.abs(interaction.pose(0).viewYaw)).toBeLessThan(Math.PI);
    settle(interaction);
    expect(interaction.pose(0).viewYaw).toBeCloseTo(0, 2);
    expect(interaction.pose(0).viewPitch).toBeCloseTo(0, 2);
    expect(interaction.viewZoom).toBeCloseTo(1, 2);
  });

  it('kolejna wybrana koszulka zaczyna od przodu', () => {
    const interaction = new RackInteraction(8);
    interaction.setSelected(0);
    interaction.rotateViewBy(1, 0.3);
    interaction.setSelected(1);
    expect(interaction.viewTarget).toEqual({ yaw: 0, pitch: 0 });
    settle(interaction);
    expect(interaction.pose(0).viewYaw).toBeCloseTo(0, 2);
  });

  it('przy ograniczonym ruchu obrót następuje od razu', () => {
    const interaction = new RackInteraction(8, () => true);
    interaction.setSelected(0);
    interaction.rotateViewBy(1, 0.2);
    expect(interaction.step(1 / 60)).toBe(false);
    expect(interaction.pose(0).viewYaw).toBe(1);
    expect(interaction.pose(0).viewPitch).toBe(0.2);
  });
});

describe('odporność', () => {
  it('długa przerwa w renderowaniu nie rozsypuje animacji', () => {
    const interaction = new RackInteraction(8);
    interaction.hovered = 0;
    interaction.step(30);
    const pose = interaction.pose(0);
    expect(Number.isFinite(pose.tiltX)).toBe(true);
    expect(Math.abs(pose.tiltX)).toBeLessThan(1);
  });

  it('przy ograniczonym ruchu pozycja zmienia się od razu, bez animacji', () => {
    const interaction = new RackInteraction(8, () => true);
    interaction.hovered = 1;
    expect(interaction.step(1 / 60)).toBe(false);
    expect(interaction.pose(1).tiltX).toBeCloseTo(-0.3, 5);
    expect(interaction.pose(1).wave).toBe(0);
  });

  it('dwie koszulki nie rozsuwają się: nie ma czego odsuwać', () => {
    const interaction = new RackInteraction(2);
    interaction.hovered = 0;
    settle(interaction);
    expect(interaction.pose(1).slideRadians).toBe(0);
  });
});
