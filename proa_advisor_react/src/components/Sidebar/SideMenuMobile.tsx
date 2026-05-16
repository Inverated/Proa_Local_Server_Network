import Divider from '@mui/material/Divider';
import Drawer, { drawerClasses } from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import MenuContent from './MenuContent';

interface SideMenuMobileProps {
  open: boolean | undefined;
  toggleDrawer: (newOpen: boolean) => () => void;
  setSelectContent: (content: unknown) => void;
}

export default function SideMenuMobile({ open, toggleDrawer, setSelectContent }: SideMenuMobileProps) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={toggleDrawer(false)}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        [`& .${drawerClasses.paper}`]: {
          backgroundImage: 'none',
          backgroundColor: 'background.paper',
        },
      }}
    >
      <Stack
        sx={{
          maxWidth: '70dvw',
          minWidth: '250px',
          height: '100%',
        }}
      >
        <Divider />
        <Stack sx={{ flexGrow: 1 }}>
          <MenuContent setSelectContent={setSelectContent} />
          <Divider />
        </Stack>
      </Stack>
    </Drawer>
  );
}
