/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { Component, Fragment } from 'react';
import { EuiTitle, EuiFlyoutHeader } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FlyoutFooter } from './flyout_footer';
import { FlyoutBody } from './flyout_body';
import { LayerDescriptor } from '../../../common/descriptor_types';
import { LayerWizard } from '../../classes/layers/layer_wizard_registry';

interface Props {
  flyoutVisible: boolean;
  isIndexingReady: boolean;
  isIndexingSuccess: boolean;
  isIndexingTriggered: boolean;
  previewLayer: (layerDescriptor: LayerDescriptor) => void;
  removeTransientLayer: () => void;
  resetIndexing: () => void;
  selectLayerAndAdd: () => void;
  setIndexingTriggered: () => void;
}

interface State {
  importView: boolean;
  isIndexingSource: boolean;
  layerDescriptor: LayerDescriptor | null;
  layerImportAddReady: boolean;
  layerWizard: LayerWizard | null;
}

export class AddLayerPanel extends Component<Props, State> {
  private _isMounted: boolean = false;

  state = {
    layerWizard: null,
    layerDescriptor: null, // TODO get this from redux store instead of storing locally
    isIndexingSource: false,
    importView: false,
    layerImportAddReady: false,
  };

  componentDidMount() {
    this._isMounted = true;
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  componentDidUpdate() {
    if (!this.state.layerImportAddReady && this.props.isIndexingSuccess) {
      this.setState({ layerImportAddReady: true });
    }
  }

  _previewLayer = (layerDescriptor: LayerDescriptor | null, isIndexingSource?: boolean) => {
    if (!this._isMounted) {
      return;
    }
    if (!layerDescriptor) {
      this.setState({
        layerDescriptor: null,
        isIndexingSource: false,
      });
      this.props.removeTransientLayer();
      return;
    }

    this.setState({ layerDescriptor, isIndexingSource: !!isIndexingSource });
    this.props.previewLayer(layerDescriptor);
  };

  _clearLayerData = ({ keepSourceType = false }: { keepSourceType: boolean }) => {
    if (!this._isMounted) {
      return;
    }

    const newState: Partial<State> = {
      layerDescriptor: null,
      isIndexingSource: false,
    };
    if (!keepSourceType) {
      newState.layerWizard = null;
      newState.importView = false;
    }
    // @ts-ignore
    this.setState(newState);

    this.props.removeTransientLayer();
  };

  _onWizardSelect = (layerWizard: LayerWizard) => {
    this.setState({ layerWizard, importView: !!layerWizard.isIndexingSource });
  };

  _layerAddHandler = () => {
    if (this.state.isIndexingSource && !this.props.isIndexingTriggered) {
      this.props.setIndexingTriggered();
    } else {
      this.props.selectLayerAndAdd();
      if (this.state.importView) {
        this.setState({
          layerImportAddReady: false,
        });
        this.props.resetIndexing();
      }
    }
  };

  render() {
    if (!this.props.flyoutVisible) {
      return null;
    }

    const panelDescription =
      this.state.layerImportAddReady || !this.state.importView
        ? i18n.translate('xpack.maps.addLayerPanel.addLayer', {
            defaultMessage: 'Add layer',
          })
        : i18n.translate('xpack.maps.addLayerPanel.importFile', {
            defaultMessage: 'Import file',
          });
    const isNextBtnEnabled = this.state.importView
      ? this.props.isIndexingReady || this.props.isIndexingSuccess
      : !!this.state.layerDescriptor;

    return (
      <Fragment>
        <EuiFlyoutHeader hasBorder className="mapLayerPanel__header">
          <EuiTitle size="s">
            <h2>{panelDescription}</h2>
          </EuiTitle>
        </EuiFlyoutHeader>

        <FlyoutBody
          layerWizard={this.state.layerWizard}
          onClear={() => this._clearLayerData({ keepSourceType: false })}
          onRemove={() => this._clearLayerData({ keepSourceType: true })}
          onWizardSelect={this._onWizardSelect}
          previewLayer={this._previewLayer}
        />

        <FlyoutFooter
          showNextButton={!!this.state.layerWizard}
          disableNextButton={!isNextBtnEnabled}
          onClick={this._layerAddHandler}
          nextButtonText={panelDescription}
        />
      </Fragment>
    );
  }
}
