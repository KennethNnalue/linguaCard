---
name: angular
description: >
  Use these Angular guidelines whenever writing or editing any component, directive,
  pipe, service, or route in the LinguaCard Ionic/Angular app. Activate for any
  frontend work in apps/mobile/ — new components, state management, templates,
  forms, or routing. This is the single source of truth for Angular coding style
  and best practices in this project.
---

# Angular Development Guidelines — LinguaCard

> Read this file before writing or editing any Angular component, directive, pipe, or service in `apps/mobile/`.

---

## Persona

Work as an Angular 20+ developer who defaults to signals, standalone components, and native control flow. Performance is paramount — optimise change detection and minimise re-renders at every opportunity.

---

## TypeScript

- Use strict type checking
- Prefer type inference when the type is obvious
- Never use `any`; use `unknown` when the type is genuinely uncertain

---

## Component rules

### Decorator
- **Do NOT set `standalone: true`** inside `@Component` / `@Directive` / `@Pipe` — standalone is the default in Angular 19+
- Always set `changeDetection: ChangeDetectionStrategy.OnPush`
- Put host bindings in the `host` object of the decorator — **never** use `@HostBinding` / `@HostListener`

```typescript
@Component({
  selector: 'lc-example',
  templateUrl: './example.component.html',
  styleUrl: './example.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.active]': 'active()' },
})
```

### Inputs / outputs
- Use `input()` signal — **never** `@Input()`
- Use `output()` function — **never** `@Output()` / `EventEmitter`

```typescript
readonly label = input.required<string>();
readonly active = input(false);
readonly chipClick = output<void>();
```

### State & derived state
- Local state: `signal()`
- Derived state: `computed()` — never re-derive in the template
- Never call `.mutate()` on a signal; use `.update()` or `.set()`

### Dependency injection
- Always use `inject()` — **never** constructor injection

---

## Template rules

- Use native control flow: `@if`, `@for`, `@switch` — **never** `*ngIf`, `*ngFor`, `*ngSwitch`
- Use `class` bindings — **never** `ngClass`
- Use `style` bindings — **never** `ngStyle`
- Use the `async` pipe for observables in templates
- Import and use built-in pipes; do not duplicate their logic
- Avoid complex expressions in templates — move logic to `computed()` or the component class
- Do not assume globals like `new Date()` are available in templates

### Example template

```html
@if (isPlaying()) {
  <lc-button variant="icon" (click)="pause()">pause</lc-button>
} @else {
  <lc-button variant="icon" (click)="play()">play</lc-button>
}

@for (card of queue(); track card.id) {
  <lc-word-item [card]="card" />
}
```

---

## Services

- `providedIn: 'root'` for singletons
- Single responsibility per service
- Always return `Observable<T>` — never subscribe inside a service
- Use `inject()` for all dependencies

---

## Forms

- Prefer **Reactive forms** over Template-driven forms

---

## Images

- Use `NgOptimizedImage` for all static images
- `NgOptimizedImage` does not work with inline base64 images — use a plain `<img>` there

---

## Routing

- Lazy-load every feature route via `loadComponent` / `loadChildren`

---

## Accessibility

- All components must pass AXE checks
- Meet WCAG AA minimums: focus management, colour contrast, ARIA attributes

---

## Quick reference — signal APIs

```typescript
// State
const count = signal(0);
count.set(1);
count.update(n => n + 1);

// Derived
const double = computed(() => count() * 2);

// Inputs (in component class)
readonly size = input<'sm' | 'md' | 'lg'>('md');
readonly required = input.required<string>();

// Outputs (in component class)
readonly clicked = output<void>();
// emit: this.clicked.emit();
```
