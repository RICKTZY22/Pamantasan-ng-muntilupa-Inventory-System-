import React, { useCallback } from 'react';
import { useRive, useStateMachineInput, Layout, Fit, Alignment } from '@rive-app/react-canvas';
// "Ballin' interactive" from the Rive community marketplace.
import ballerSrc from '../../assets/rive/baller.riv';

const STATE_MACHINE = 'Baller';

/**
 * Decorative interactive mascot for the brand panel. The trigger lookups are
 * optional so the animation still plays if the Rive file changes.
 */
const RiveHero = () => {
    const { rive, RiveComponent } = useRive({
        src: ballerSrc,
        stateMachines: STATE_MACHINE,
        autoplay: true,
        // Fit by height keeps the head and feet in frame while staying large.
        layout: new Layout({ fit: Fit.FitHeight, alignment: Alignment.BottomCenter }),
    });

    const clickBall = useStateMachineInput(rive, STATE_MACHINE, 'click Ball');
    const hitBall = useStateMachineInput(rive, STATE_MACHINE, 'hit ball');

    const handlePlay = useCallback(() => {
        clickBall?.fire();
        hitBall?.fire();
    }, [clickBall, hitBall]);

    return (
        <div className="w-full h-full flex items-end justify-center overflow-visible">
            <RiveComponent
                role="img"
                aria-label="Interactive basketball animation"
                onClick={handlePlay}
                className="h-full w-full origin-bottom scale-[1.08] cursor-pointer"
            />
        </div>
    );
};

export default RiveHero;
