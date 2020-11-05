import React, {useCallback, useEffect} from 'react';
import {AddNotebookEvent} from '../../components/DialogManager/recievers';
import {Placeholder} from '../../components/ListPlaceholders';
import SimpleList from '../../components/SimpleList';
import {NotebookItemWrapper} from '../../components/SimpleList/NotebookItemWrapper';
import {useTracked} from '../../provider';
import {Actions} from '../../provider/Actions';
import {ContainerBottomButton} from '../../components/Container/ContainerBottomButton';
import {eSendEvent} from '../../services/EventManager';
import {eUpdateSearchState} from '../../utils/Events';
export const Folders = ({route, navigation}) => {
  const [state, dispatch] = useTracked();
  const {notebooks} = state;

  const onFocus = useCallback(() => {
    dispatch({
      type: Actions.HEADER_STATE,
      state: true,
    });
    dispatch({
      type: Actions.HEADER_TEXT_STATE,
      state: {
        heading: 'Notebooks',
      },
    });

    dispatch({type: Actions.NOTEBOOKS});
    dispatch({
      type: Actions.CURRENT_SCREEN,
      screen: 'notebooks',
    });
    updateSearch();

  }, [notebooks]);

  const updateSearch = () => {
    if (notebooks.length === 0) {
      eSendEvent('showSearch', true);
    } else {
      eSendEvent('showSearch');
      eSendEvent(eUpdateSearchState, {
        placeholder: 'Search all notebooks',
        data: notebooks,
        noSearch: false,
        type: 'notebooks',
        color: null,
      });
    }
  }


  useEffect(() => {
    navigation.addListener('focus', onFocus);
    return () => {
      navigation.removeListener('focus', onFocus);
    };
  });

  useEffect(() => {
    if (navigation.isFocused()) {
      updateSearch();
    }
  }, [notebooks]);

  useEffect(() => {
    console.log('render folders');
  });

  const _onPressBottomButton = () => AddNotebookEvent();

  return (
    <>
      <SimpleList
        data={notebooks}
        type="notebooks"
        focused={() => navigation.isFocused()}
        RenderItem={NotebookItemWrapper}
        placeholder={<Placeholder type="notebooks" />}
      />
      <ContainerBottomButton
        title="Create a new notebook"
        onPress={_onPressBottomButton}
      />
    </>
  );
};

export default Folders;
