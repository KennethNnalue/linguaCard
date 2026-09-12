import { ComponentFixture, TestBed } from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { TabsPage } from './tabs.page';

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsPage],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the primary navigation tabs with the intended icons and order', () => {
    const tabButtons = fixture.debugElement.queryAll(By.css('ion-tab-button'));
    const icons = fixture.debugElement.queryAll(By.css('ion-tab-button ion-icon'));

    expect(tabButtons.map(button => button.attributes['tab'])).toEqual([
      'home',
      'vault',
      'review',
      'stories',
      'listen',
    ]);
    expect(icons.map(icon => icon.attributes['name'])).toEqual([
      'home-outline',
      'folder-open-outline',
      'play-circle-outline',
      'book-outline',
      'volume-high-outline',
    ]);
  });
});
